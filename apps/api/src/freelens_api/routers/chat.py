from fastapi import APIRouter, Depends, HTTPException, status

from ..dependencies import AuthContext, get_auth_context, require_csrf
from ..schemas import ChatRequest, ChatResponse, MemoryEvidence
from ..services.hindsight import HindsightError, HindsightRateLimitError, hindsight

router = APIRouter(prefix="/chat", tags=["chat"])


def _is_meaningful(message: str) -> bool:
    normalized = " ".join(message.lower().split())
    casual = {"hi", "hello", "hey", "thanks", "thank you", "ok", "okay", "bye"}
    question_starters = (
        "what ",
        "when ",
        "where ",
        "which ",
        "who ",
        "why ",
        "how ",
        "can ",
        "could ",
        "do ",
        "does ",
        "did ",
        "is ",
        "are ",
        "should ",
        "would ",
    )
    is_question = normalized.endswith("?") or normalized.startswith(question_starters)
    return normalized not in casual and not is_question and len(normalized) >= 12


def _is_structured_data(message: str) -> bool:
    normalized = message.strip().lower()
    lines = [line.strip() for line in message.splitlines() if line.strip()]
    explicit_prefixes = ("remember:", "save:", "note:", "store:")
    field_count = sum(1 for line in lines if ":" in line)
    return normalized.startswith(explicit_prefixes) or (len(lines) >= 2 and field_count >= 2)


def _relevant_memories(memories: list[dict], limit: int = 5) -> list[dict]:
    # Hindsight already returns results in relevance order. Do not apply a hard score
    # cutoff: short queries and spelling mistakes can produce low absolute scores while
    # still ranking the correct agency fact first.
    return memories[:limit]


@router.post("", response_model=ChatResponse, dependencies=[Depends(require_csrf)])
async def chat(
    payload: ChatRequest,
    context: AuthContext = Depends(get_auth_context),
) -> ChatResponse:
    bank_id = context.organization.hindsight_bank_id
    try:
        # Idempotent provisioning also repairs workspaces created before bank setup was added.
        await hindsight.create_bank(bank_id, context.organization.name)
        if _is_structured_data(payload.message):
            await hindsight.retain(
                bank_id,
                content=payload.message,
                context="Structured agency data submitted by a workspace member",
                document_id=f"submission-{payload.conversation_id}",
                metadata={
                    "source": "structured-chat-submission",
                    "conversation_id": payload.conversation_id,
                    "user_id": str(context.user.id),
                },
                tags=[
                    "source:structured-chat-submission",
                    f"conversation:{payload.conversation_id}",
                    f"user:{context.user.id}",
                ],
            )
            return ChatResponse(
                answer="I’ve accepted this agency data and queued it for memory processing.",
                conversation_id=payload.conversation_id,
                memories_used=[],
                remembered=True,
            )

        memories = _relevant_memories(await hindsight.recall(bank_id, payload.message))
        answer = await hindsight.reflect(bank_id, payload.message, memories)
        remembered = _is_meaningful(payload.message)
        if remembered:
            await hindsight.retain(
                bank_id,
                content=f"User: {payload.message}\nHindsightOps: {answer}",
                context="HindsightOps agency conversation",
                document_id=f"conversation-{payload.conversation_id}",
                metadata={
                    "source": "chat",
                    "conversation_id": payload.conversation_id,
                    "user_id": str(context.user.id),
                },
                tags=[
                    f"conversation:{payload.conversation_id}",
                    f"user:{context.user.id}",
                ],
            )
    except HindsightRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Groq's free-tier rate limit was reached. Please retry in about a minute.",
        ) from exc
    except HindsightError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Memory service is temporarily unavailable",
        ) from exc

    evidence = [
        MemoryEvidence(
            id=str(item.get("id", "")),
            text=str(item.get("text", "")),
            type=str(item.get("type", "memory")),
            score=item.get("scores", {}).get("final"),
        )
        for item in memories[:5]
    ]
    return ChatResponse(
        answer=answer,
        conversation_id=payload.conversation_id,
        memories_used=evidence,
        remembered=remembered,
    )


@router.get("/memory-stats")
async def memory_stats(context: AuthContext = Depends(get_auth_context)):
    try:
        return await hindsight.stats(context.organization.hindsight_bank_id)
    except HindsightError as exc:
        raise HTTPException(status_code=503, detail="Memory service is temporarily unavailable") from exc


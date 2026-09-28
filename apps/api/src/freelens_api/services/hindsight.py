from typing import Any

import httpx

from ..config import get_settings


class HindsightError(RuntimeError):
    pass


class HindsightRateLimitError(HindsightError):
    pass


class HindsightService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.base_url = self.settings.hindsight_api_url.rstrip("/")

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{self.base_url}/health/ready")
                return (
                    response.is_success and response.json().get("status") == "healthy"
                )
        except (httpx.HTTPError, ValueError):
            return False

    async def recall(self, bank_id: str, query: str) -> list[dict[str, Any]]:
        payload = {"query": query, "budget": "low", "max_tokens": 1024}
        data = await self._post(f"/v1/default/banks/{bank_id}/memories/recall", payload)
        return data.get("results", [])

    async def create_bank(self, bank_id: str, name: str) -> None:
        payload = {
            "name": name,
            "retain_mission": (
                "Keep useful facts about the agency's clients, people, projects, contracts, "
                "deadlines, preferences, and decisions. Ignore greetings and casual chatter."
            ),
            "reflect_mission": (
                "You are HindsightOps, a practical operations assistant for a freelance agency. "
                "Ground answers in agency memory and clearly state uncertainty."
            ),
            "enable_observations": False,
        }
        await self._put(f"/v1/default/banks/{bank_id}", payload)

    async def delete_bank(self, bank_id: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.delete(
                    f"{self.base_url}/v1/default/banks/{bank_id}"
                )
                if response.status_code == 404:
                    return
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise HindsightError("Unable to delete the Hindsight memory bank") from exc

    async def reflect(
        self,
        bank_id: str,
        query: str,
        memories: list[dict[str, Any]] | None = None,
    ) -> str:
        # The bank's reflect mission already provides role and grounding instructions.
        # Recall is performed explicitly so grounding does not depend on an optional tool call.
        relevant_context = "\n".join(
            f"- {item.get('text', '')}" for item in (memories or []) if item.get("text")
        )
        grounded_query = query
        if relevant_context:
            grounded_query = (
                f"Relevant agency memory:\n{relevant_context}\n\n"
                f"Request: {query}\nAnswer from the memory above; state uncertainty if needed."
            )
        payload = {"query": grounded_query, "budget": "low", "max_tokens": 512}
        data = await self._post(f"/v1/default/banks/{bank_id}/reflect", payload)
        return str(data["text"])

    async def retain(
        self,
        bank_id: str,
        *,
        content: str,
        context: str,
        document_id: str,
        metadata: dict[str, str],
        tags: list[str],
    ) -> None:
        payload = {
            "items": [
                {
                    "content": content,
                    "context": context,
                    "document_id": document_id,
                    "metadata": metadata,
                    "tags": tags,
                    "update_mode": "append",
                }
            ],
            "async": True,
        }
        await self._post(f"/v1/default/banks/{bank_id}/memories", payload, timeout=300)

    async def stats(self, bank_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{self.base_url}/v1/default/banks/{bank_id}/stats"
            )
            if not response.is_success:
                raise HindsightError(
                    f"Hindsight stats failed with status {response.status_code}"
                )
            return response.json()

    async def _post(
        self, path: str, payload: dict[str, Any], timeout: float = 180
    ) -> dict[str, Any]:
        return await self._request("POST", path, payload, timeout)

    async def _put(
        self, path: str, payload: dict[str, Any], timeout: float = 30
    ) -> dict[str, Any]:
        return await self._request("PUT", path, payload, timeout)

    async def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any],
        timeout: float,
    ) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.request(
                    method, f"{self.base_url}{path}", json=payload
                )
                if (
                    response.status_code in {429, 500}
                    and "quota exhausted" in response.text.lower()
                ):
                    raise HindsightRateLimitError("Groq provider rate limit reached")
                response.raise_for_status()
                return response.json()
        except HindsightRateLimitError:
            raise
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise HindsightError("Hindsight is temporarily unavailable") from exc


hindsight = HindsightService()

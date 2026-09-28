import pytest

from freelens_api.routers.chat import (
    _is_meaningful,
    _is_structured_data,
    _relevant_memories,
)


@pytest.mark.parametrize("message", ["hi", " Hello ", "thanks", "okay", "bye"])
def test_casual_messages_are_not_retained(message: str) -> None:
    assert not _is_meaningful(message)


@pytest.mark.parametrize(
    "message",
    [
        "The Acme renewal is due on 15 October.",
        "Priya owns the Northstar client relationship.",
        "We decided to use a fixed-price contract.",
    ],
)
def test_useful_agency_context_is_retained(message: str) -> None:
    assert _is_meaningful(message)


@pytest.mark.parametrize(
    "message",
    [
        "Who owns the Northstar client relationship?",
        "What renewals are coming up?",
        "Can you find a React freelancer",
    ],
)
def test_questions_are_not_retained_as_facts(message: str) -> None:
    assert not _is_meaningful(message)


def test_multiline_field_data_uses_ingestion_path() -> None:
    message = "Agency Name: Freelens Studio\nOwner: Priya\nLocation: Bengaluru"

    assert _is_structured_data(message)


def test_explicit_remember_command_uses_ingestion_path() -> None:
    assert _is_structured_data("Remember: Acme renews on 15 October")


def test_ranked_memories_are_used_without_a_brittle_score_cutoff() -> None:
    memories = [
        {"text": "Relevant", "scores": {"final": 0.91}},
        {"text": "Noise", "scores": {"final": 0.001}},
        {"text": "Unscored"},
    ]

    assert [item["text"] for item in _relevant_memories(memories)] == [
        "Relevant",
        "Noise",
        "Unscored",
    ]

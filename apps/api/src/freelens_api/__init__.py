"""Freelens AI backend package."""


def main() -> None:
    """Run the development API server."""
    import uvicorn

    uvicorn.run("freelens_api.main:app", host="0.0.0.0", port=8000, reload=True)

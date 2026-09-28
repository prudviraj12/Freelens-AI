from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV = Path(__file__).resolve().parents[4] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(ROOT_ENV, ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "HindsightOps"
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    frontend_url: str = "http://localhost:3000"
    database_url: str = "postgresql+asyncpg://freelens:freelens-local@localhost:5433/freelens"
    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    cookie_secure: bool = False
    access_cookie_name: str = "freelens_access"
    refresh_cookie_name: str = "freelens_refresh"
    csrf_cookie_name: str = "freelens_csrf"
    hindsight_api_url: str = "http://localhost:8888"
    s3_endpoint_url: str = "http://localhost:9000"
    s3_region: str = "auto"
    s3_access_key_id: str = "freelens"
    s3_secret_access_key: str = "freelens-local-secret"
    s3_bucket: str = "freelens-documents"
    s3_max_upload_mb: int = 20

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


import uuid
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from .models import Role


class BootstrapRequest(BaseModel):
    display_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    organization_name: str = Field(min_length=2, max_length=160)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    display_name: str
    organization_id: uuid.UUID
    organization_name: str
    role: Role


class AuthResponse(BaseModel):
    user: UserResponse
    csrf_token: str


class SetupStatusResponse(BaseModel):
    bootstrap_required: bool


class CreateAgencyRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)


class AgencyMembershipResponse(BaseModel):
    id: uuid.UUID
    name: str
    role: Role


class DeleteAgencyResponse(BaseModel):
    account_deleted: bool
    bootstrap_required: bool
    auth: AuthResponse | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12_000)
    conversation_id: str = Field(min_length=1, max_length=120)


class MemoryEvidence(BaseModel):
    id: str
    text: str
    type: str
    score: float | None = None


class ChatResponse(BaseModel):
    answer: str
    conversation_id: str
    memories_used: list[MemoryEvidence]
    remembered: bool


class HealthResponse(BaseModel):
    status: Literal["healthy", "degraded"]
    database: bool
    hindsight: bool

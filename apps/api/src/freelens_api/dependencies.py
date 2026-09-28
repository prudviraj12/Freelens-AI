import secrets
import uuid
from dataclasses import dataclass

import jwt
from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from .config import get_settings
from .db import get_db
from .models import Membership, User
from .security import decode_token

settings = get_settings()


@dataclass
class AuthContext:
    user: User
    membership: Membership

    @property
    def organization(self):
        return self.membership.organization


async def get_auth_context(
    access_token: str | None = Cookie(default=None, alias=settings.access_cookie_name),
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
    )
    if not access_token:
        raise credentials_error
    try:
        payload = decode_token(access_token, "access")
        user_id = uuid.UUID(payload["sub"])
        organization_id = uuid.UUID(payload["org"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise credentials_error from None

    result = await db.execute(
        select(Membership)
        .options(joinedload(Membership.user), joinedload(Membership.organization))
        .where(
            Membership.user_id == user_id,
            Membership.organization_id == organization_id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership or not membership.user.is_active:
        raise credentials_error
    return AuthContext(user=membership.user, membership=membership)


async def require_csrf(
    csrf_header: str | None = Header(default=None, alias="X-CSRF-Token"),
    csrf_cookie: str | None = Cookie(default=None, alias=settings.csrf_cookie_name),
) -> None:
    if not csrf_header or not csrf_cookie or not secrets.compare_digest(csrf_header, csrf_cookie):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")


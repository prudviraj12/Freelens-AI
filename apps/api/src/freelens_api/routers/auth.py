import re
import uuid
from datetime import UTC, datetime

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from ..config import get_settings
from ..db import get_db
from ..dependencies import AuthContext, get_auth_context, require_csrf
from ..models import AuthSession, Membership, Organization, Role, User
from ..schemas import (
    AgencyMembershipResponse,
    AuthResponse,
    BootstrapRequest,
    CreateAgencyRequest,
    DeleteAgencyResponse,
    LoginRequest,
    SetupStatusResponse,
    UserResponse,
)
from ..security import (
    create_access_token,
    create_csrf_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from ..services.hindsight import HindsightError, hindsight

router = APIRouter(prefix="/auth", tags=["authentication"])
settings = get_settings()


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or "agency"


def _user_response(membership: Membership) -> UserResponse:
    return UserResponse(
        id=membership.user.id,
        email=membership.user.email,
        display_name=membership.user.display_name,
        organization_id=membership.organization.id,
        organization_name=membership.organization.name,
        role=membership.role,
    )


def _set_auth_cookies(
    response: Response,
    *,
    access_token: str,
    refresh_token: str,
    csrf_token: str,
) -> None:
    common = {
        "secure": settings.cookie_secure,
        "samesite": "lax",
        "path": "/",
    }
    response.set_cookie(
        settings.access_cookie_name,
        access_token,
        httponly=True,
        max_age=settings.access_token_minutes * 60,
        **common,
    )
    response.set_cookie(
        settings.refresh_cookie_name,
        refresh_token,
        httponly=True,
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        **common,
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf_token,
        httponly=False,
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        **common,
    )


def _clear_auth_cookies(response: Response) -> None:
    for name in (
        settings.access_cookie_name,
        settings.refresh_cookie_name,
        settings.csrf_cookie_name,
    ):
        response.delete_cookie(name, path="/")


async def _issue_session(
    response: Response,
    request: Request,
    db: AsyncSession,
    membership: Membership,
) -> AuthResponse:
    session_id = uuid.uuid4()
    refresh_token, expires_at = create_refresh_token(
        user_id=membership.user.id,
        session_id=session_id,
        organization_id=membership.organization.id,
    )
    db.add(
        AuthSession(
            id=session_id,
            user_id=membership.user.id,
            refresh_token_hash=hash_token(refresh_token),
            expires_at=expires_at,
            user_agent=request.headers.get("user-agent", "")[:512],
        )
    )
    access_token = create_access_token(
        user_id=membership.user.id,
        organization_id=membership.organization.id,
        role=membership.role.value,
    )
    csrf_token = create_csrf_token()
    _set_auth_cookies(
        response,
        access_token=access_token,
        refresh_token=refresh_token,
        csrf_token=csrf_token,
    )
    return AuthResponse(user=_user_response(membership), csrf_token=csrf_token)


@router.get("/setup-status", response_model=SetupStatusResponse)
async def setup_status(db: AsyncSession = Depends(get_db)) -> SetupStatusResponse:
    total = await db.scalar(select(func.count()).select_from(User))
    return SetupStatusResponse(bootstrap_required=(total or 0) == 0)


@router.post(
    "/bootstrap", response_model=AuthResponse, status_code=status.HTTP_201_CREATED
)
async def bootstrap(
    payload: BootstrapRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    total = await db.scalar(select(func.count()).select_from(User))
    if total:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Workspace is already initialized",
        )

    organization_id = uuid.uuid4()
    organization = Organization(
        id=organization_id,
        name=payload.organization_name.strip(),
        slug=f"{_slugify(payload.organization_name)}-{str(organization_id)[:8]}",
        hindsight_bank_id=f"org-{organization_id}",
    )
    user = User(
        email=payload.email.lower(),
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
    )
    membership = Membership(organization=organization, user=user, role=Role.owner)
    db.add_all([organization, user, membership])
    await db.flush()
    try:
        await hindsight.create_bank(organization.hindsight_bank_id, organization.name)
    except HindsightError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to provision the agency memory bank",
        ) from exc
    result = await _issue_session(response, request, db, membership)
    await db.commit()
    return result


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    result = await db.execute(
        select(User)
        .options(
            joinedload(User.memberships).joinedload(Membership.organization),
        )
        .where(User.email == payload.email.lower())
    )
    user = result.unique().scalar_one_or_none()
    if (
        not user
        or not user.is_active
        or not verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    if not user.memberships:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="No agency membership"
        )
    auth_response = await _issue_session(response, request, db, user.memberships[0])
    await db.commit()
    return auth_response


@router.get("/me", response_model=UserResponse)
async def me(context: AuthContext = Depends(get_auth_context)) -> UserResponse:
    return _user_response(context.membership)


@router.post(
    "/refresh", response_model=AuthResponse, dependencies=[Depends(require_csrf)]
)
async def refresh(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(
        default=None, alias=settings.refresh_cookie_name
    ),
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token required"
        )
    try:
        payload = decode_token(refresh_token, "refresh")
        session_id = uuid.UUID(payload["sid"])
        user_id = uuid.UUID(payload["sub"])
        organization_id = uuid.UUID(payload["org"]) if payload.get("org") else None
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from None

    result = await db.execute(
        select(AuthSession).where(
            AuthSession.id == session_id, AuthSession.user_id == user_id
        )
    )
    old_session = result.scalar_one_or_none()
    if (
        not old_session
        or old_session.revoked_at is not None
        or old_session.expires_at <= datetime.now(UTC)
        or old_session.refresh_token_hash != hash_token(refresh_token)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh session expired"
        )

    membership_query = (
        select(Membership)
        .options(joinedload(Membership.user), joinedload(Membership.organization))
        .where(Membership.user_id == user_id)
    )
    if organization_id is not None:
        membership_query = membership_query.where(
            Membership.organization_id == organization_id
        )
    membership_result = await db.execute(membership_query)
    membership = membership_result.scalars().first()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Membership unavailable"
        )

    old_session.revoked_at = datetime.now(UTC)
    auth_response = await _issue_session(response, request, db, membership)
    newest = next(item for item in db.new if isinstance(item, AuthSession))
    old_session.replaced_by_id = newest.id
    await db.commit()
    return auth_response


@router.get("/agencies", response_model=list[AgencyMembershipResponse])
async def list_agencies(
    context: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> list[AgencyMembershipResponse]:
    result = await db.execute(
        select(Membership)
        .options(joinedload(Membership.organization))
        .where(Membership.user_id == context.user.id)
        .order_by(Membership.created_at)
    )
    return [
        AgencyMembershipResponse(
            id=membership.organization.id,
            name=membership.organization.name,
            role=membership.role,
        )
        for membership in result.scalars()
    ]


@router.post(
    "/agencies",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_agency(
    payload: CreateAgencyRequest,
    request: Request,
    response: Response,
    context: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    organization_id = uuid.uuid4()
    name = payload.name.strip()
    organization = Organization(
        id=organization_id,
        name=name,
        slug=f"{_slugify(name)}-{str(organization_id)[:8]}",
        hindsight_bank_id=f"org-{organization_id}",
    )
    membership = Membership(
        organization=organization,
        user=context.user,
        role=Role.owner,
    )
    db.add_all([organization, membership])
    await db.flush()
    try:
        await hindsight.create_bank(organization.hindsight_bank_id, organization.name)
    except HindsightError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to provision the agency memory bank",
        ) from exc
    auth_response = await _issue_session(response, request, db, membership)
    await db.commit()
    return auth_response


@router.post(
    "/agencies/{organization_id}/switch",
    response_model=AuthResponse,
    dependencies=[Depends(require_csrf)],
)
async def switch_agency(
    organization_id: uuid.UUID,
    request: Request,
    response: Response,
    context: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    result = await db.execute(
        select(Membership)
        .options(joinedload(Membership.user), joinedload(Membership.organization))
        .where(
            Membership.user_id == context.user.id,
            Membership.organization_id == organization_id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agency not found"
        )
    auth_response = await _issue_session(response, request, db, membership)
    await db.commit()
    return auth_response


@router.delete(
    "/agencies/{organization_id}",
    response_model=DeleteAgencyResponse,
    dependencies=[Depends(require_csrf)],
)
async def delete_agency(
    organization_id: uuid.UUID,
    request: Request,
    response: Response,
    context: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> DeleteAgencyResponse:
    if organization_id != context.organization.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Switch to the agency before deleting it",
        )
    if context.membership.role is not Role.owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the agency owner can delete this agency",
        )

    member_count = await db.scalar(
        select(func.count())
        .select_from(Membership)
        .where(Membership.organization_id == organization_id)
    )
    if (member_count or 0) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Remove the other agency members before deleting this agency",
        )

    remaining_result = await db.execute(
        select(Membership)
        .options(joinedload(Membership.user), joinedload(Membership.organization))
        .where(
            Membership.user_id == context.user.id,
            Membership.organization_id != organization_id,
        )
        .order_by(Membership.created_at)
    )
    next_membership = remaining_result.scalars().first()

    try:
        await hindsight.delete_bank(context.organization.hindsight_bank_id)
    except HindsightError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to delete the agency memory bank",
        ) from exc

    await db.delete(context.organization)
    if next_membership is not None:
        auth_response = await _issue_session(response, request, db, next_membership)
        await db.commit()
        return DeleteAgencyResponse(
            account_deleted=False,
            bootstrap_required=False,
            auth=auth_response,
        )

    await db.delete(context.user)
    _clear_auth_cookies(response)
    await db.commit()
    total_users = await db.scalar(select(func.count()).select_from(User))
    return DeleteAgencyResponse(
        account_deleted=True,
        bootstrap_required=(total_users or 0) == 0,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(
        default=None, alias=settings.refresh_cookie_name
    ),
    db: AsyncSession = Depends(get_db),
) -> Response:
    if refresh_token:
        try:
            payload = decode_token(refresh_token, "refresh")
            session_id = uuid.UUID(payload["sid"])
            session = await db.get(AuthSession, session_id)
            if session and session.revoked_at is None:
                session.revoked_at = datetime.now(UTC)
                await db.commit()
        except (jwt.InvalidTokenError, KeyError, ValueError):
            pass
    _clear_auth_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response

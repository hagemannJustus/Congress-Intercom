import secrets
import datetime
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models import MagicLink

# Token generation service
async def create_magic_link_token(db: AsyncSession, email: str, expiry_minutes: int = 15):
    # Generate a secure random token
    token = secrets.token_urlsafe(32)
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=expiry_minutes)

    # Store it in the database
    new_link = MagicLink(email=email, token=token, expires_at=expires_at)
    db.add(new_link)
    await db.commit()
    await db.refresh(new_link)
    
    return token

async def verify_magic_link_token(db: AsyncSession, token: str):
    # Retrieve the magic link from the database
    query = select(MagicLink).where(MagicLink.token == token)
    result = await db.execute(query)
    magic_link = result.scalar_one_or_none()

    if not magic_link:
        return None, "Invalid token"

    # Check expiration
    if datetime.datetime.utcnow() > magic_link.expires_at:
        return None, "Token expired"

    # In a real app, delete the token to prevent reuse (One-time use)
    await db.delete(magic_link)
    await db.commit()

    return magic_link.email, None

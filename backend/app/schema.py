import strawberry
from typing import Optional, List
from .services.auth import create_magic_link_token
from .services.mailer import send_magic_link_email
from .database import AsyncSessionLocal
import logging
import os

# ─────────────────────────── Types ───────────────────────────

@strawberry.type
class MagicLinkResponse:
    success: bool
    message: str

@strawberry.type
class AgentType:
    id: int
    project_id: int
    name: str
    soul: str
    gemini_api_key: Optional[str] = None

@strawberry.type
class ProjectMemberType:
    id: int
    email: str
    is_removed: bool
    last_online: Optional[str]   # ISO string or None
    typing_until: Optional[str]  # ISO string or None
    operator_typing_until: Optional[str] = None

@strawberry.type
class ProjectType:
    id: int
    title: str
    picture_url: str
    description: str
    members: List[ProjectMemberType]
    agent: Optional['AgentType'] = None

    @strawberry.field
    async def unread_count(self) -> int:
        from .models import Message
        from .database import AsyncSessionLocal
        from sqlalchemy.future import select
        from sqlalchemy import func
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(func.count(Message.id))
                .where(
                    Message.project_id == self.id,
                    Message.sender == 'member',
                    Message.is_read == False
                )
            )
            return result.scalar() or 0

@strawberry.type
class MessageType:
    id: int
    project_id: int
    member_email: str
    content: str
    sender: str       # 'operator' | 'member'
    sent_at: str      # ISO string
    is_read: bool
    project_title: Optional[str] = None

# ─────────────────────────── Helpers ─────────────────────────

def _member_to_type(m) -> ProjectMemberType:
    return ProjectMemberType(
        id=m.id,
        email=m.email,
        is_removed=bool(m.is_removed),
        last_online=m.last_online.isoformat(timespec='milliseconds') + 'Z' if m.last_online else None,
        typing_until=m.typing_until.isoformat(timespec='milliseconds') + 'Z' if m.typing_until else None,
        operator_typing_until=m.operator_typing_until.isoformat(timespec='milliseconds') + 'Z' if m.operator_typing_until else None,
    )

def _project_to_type(p) -> ProjectType:
    return ProjectType(
        id=p.id,
        title=p.title,
        picture_url=p.picture_url,
        description=p.description,
        members=[_member_to_type(m) for m in p.members],
        agent=AgentType(
            id=p.agent.id,
            project_id=p.agent.project_id,
            name=p.agent.name,
            soul=p.agent.soul,
            gemini_api_key=p.agent.gemini_api_key or os.getenv("GEMINI_API_KEY"),
        ) if p.agent else None,
    )

def _message_to_type(m) -> MessageType:
    return MessageType(
        id=m.id,
        project_id=m.project_id,
        member_email=m.member_email,
        content=m.content,
        sender=m.sender,
        sent_at=m.sent_at.isoformat(timespec='milliseconds') + 'Z',
        is_read=bool(m.is_read),
        project_title=getattr(m, 'project_title', None)
    )

# ─────────────────────────── Query ───────────────────────────

@strawberry.type
class Query:
    @strawberry.field
    def hello(self) -> str:
        return "Welcome to the Magic Link API!"

    @strawberry.field
    async def projects(self) -> List[ProjectType]:
        from .models import Project
        from sqlalchemy.future import select
        from sqlalchemy.orm import selectinload
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Project).options(selectinload(Project.members), selectinload(Project.agent))
            )
            return [_project_to_type(p) for p in result.scalars().all()]

    @strawberry.field
    async def project(self, id: int) -> Optional[ProjectType]:
        from .models import Project
        from sqlalchemy.future import select
        from sqlalchemy.orm import selectinload
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Project).where(Project.id == id).options(selectinload(Project.members), selectinload(Project.agent))
            )
            p = result.scalar_one_or_none()
            return _project_to_type(p) if p else None

    @strawberry.field
    async def messages(self, project_id: int, member_email: str) -> List[MessageType]:
        from .models import Message
        from sqlalchemy.future import select
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Message)
                .where(Message.project_id == project_id, Message.member_email == member_email)
                .order_by(Message.sent_at)
            )
            return [_message_to_type(m) for m in result.scalars().all()]

    @strawberry.field
    async def unread_counts(self, project_id: int) -> str:
        """Returns JSON: { email: unread_count }"""
        import json
        from .models import Message
        from sqlalchemy.future import select
        from sqlalchemy import func
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Message.member_email, func.count(Message.id).label("cnt"))
                .where(
                    Message.project_id == project_id,
                    Message.sender == 'member',
                    Message.is_read == False,
                )
                .group_by(Message.member_email)
            )
            counts = {row[0]: row[1] for row in result.fetchall()}
            return json.dumps(counts)

    @strawberry.field
    async def unread_messages(self, member_email: str) -> List[MessageType]:
        from .models import Message, Project
        from sqlalchemy.future import select
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Message, Project.title)
                .join(Project, Message.project_id == Project.id)
                .where(
                    Message.member_email == member_email,
                    Message.sender == 'operator',
                    Message.is_read == False,
                )
                .order_by(Message.sent_at)
            )
            rows = result.all()
            messages = []
            for m, title in rows:
                t = _message_to_type(m)
                t.project_title = title
                messages.append(t)
            return messages

    @strawberry.field
    async def chat_status(self, project_id: int, member_email: str) -> Optional[ProjectMemberType]:
        from .models import ProjectMember
        from sqlalchemy.future import select
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.email == member_email
                )
            )
            pm = result.scalar_one_or_none()
            return _member_to_type(pm) if pm else None

    @strawberry.field
    async def suggest_response(self, project_id: int, member_email: str, force: bool = False) -> Optional[str]:
        """Calls Gemini and returns a suggested reply, '__NO_RESPONSE__' if no reply needed,
        or '__ERROR__:<message>' on failure. Returns None if no agent configured.
        When force=True, Gemini is instructed to always write a reply, and if possible, a fresh one if it's a redo."""
        from .models import Agent, Message
        from sqlalchemy.future import select
        import httpx

        async with AsyncSessionLocal() as db:
            # Load agent
            agent_result = await db.execute(select(Agent).where(Agent.project_id == project_id))
            agent = agent_result.scalar_one_or_none()
            if not agent:
                return None
            
            import os
            api_key = agent.gemini_api_key or os.getenv("GEMINI_API_KEY")
            if not api_key:
                return None

            # Load messages - STRICTLY filtered by project and member email
            msg_result = await db.execute(
                select(Message)
                .where(Message.project_id == project_id, Message.member_email == member_email)
                .order_by(Message.sent_at)
            )
            msgs = msg_result.scalars().all()

        # Build conversation transcript
        transcript = "\n".join(
            f"{'Operator' if m.sender == 'operator' else 'Member'}: {m.content}"
            for m in msgs
        ) or "(no messages yet)"

        # Tailor prompt based on whether it's a forced suggestion (like a redo or new message Arrival)
        if force:
            system_prompt = f"""You are {agent.name}, an AI assistant helping an operator respond to a member in a live chat for project_id {project_id}.
STRICT CONTEXT: You are only assisting for member {member_email}.

Your soul / guidelines:
{agent.soul}

Here is the full chat history between the operator and the member:
{transcript}

The operator requested a suggestion (it might be a 'Redo' or a fresh arrival). 
Write the operator's next reply to the member. Be helpful, concise, and follow your guidelines.

FORMATTING RULES:
- Use HTML for formatting.
- Use <b>text</b> for bold, <i>text</i> for italic, <u>text</u> for underline.
- Use <ul><li>item</li></ul> for bullet lists.
- Use <br/> for line breaks.
- Avoid using Markdown (like **bold** or *italic*). Use ONLY the HTML tags listed above.

Output ONLY the reply text — no prefix, label, quotes, or explanation."""
        else:
            system_prompt = f"""You are {agent.name}, an AI assistant helping an operator respond to a member in a live chat for project_id {project_id}.
STRICT CONTEXT: You are only assisting for member {member_email}.

Your soul / guidelines:
{agent.soul}

Here is the full chat history between the operator and the member:
{transcript}

Based on the conversation above and your guidelines, decide whether the operator needs to send a reply right now.

- If a reply IS needed, output the suggested reply message text using HTML formatting (<b>, <i>, <u>, <ul>, <li>, <br/>). Do not use Markdown. Output ONLY the message text.
- If NO reply is needed, output exactly the string: __NO_RESPONSE__

Respond now:"""

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
        # Using a slightly higher temperature for variety on redos
        payload = {
            "contents": [{"parts": [{"text": system_prompt}]}],
            "generationConfig": {"temperature": 0.8, "maxOutputTokens": 1024}
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                return f"__ERROR__:HTTP {resp.status_code}: {resp.text[:200]}"
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            return text
        except Exception as e:
            return f"__ERROR__:{str(e)[:200]}"

# ─────────────────────────── Mutation ────────────────────────

@strawberry.type
class Mutation:
    @strawberry.mutation
    async def request_magic_link(self, email: str) -> MagicLinkResponse:
        import re
        if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
            return MagicLinkResponse(success=False, message="Invalid email format")
        try:
            async with AsyncSessionLocal() as db:
                token = await create_magic_link_token(db, email)
                await send_magic_link_email(email, token)
            return MagicLinkResponse(success=True, message="Magic link sent successfully")
        except Exception as e:
            logging.error(f"Error sending magic link for {email}: {e}")
            return MagicLinkResponse(success=False, message="An internal error occurred")

    @strawberry.mutation
    async def create_project(self,
                             title: str,
                             description: str,
                             member_emails: List[str],
                             picture_url: str) -> ProjectType:
        from .models import Project, ProjectMember
        async with AsyncSessionLocal() as db:
            project = Project(title=title, picture_url=picture_url, description=description)
            db.add(project)
            await db.flush()
            for email in member_emails:
                db.add(ProjectMember(email=email, project_id=project.id))
            await db.commit()

            from sqlalchemy.future import select
            from sqlalchemy.orm import selectinload
            result = await db.execute(
                select(Project).where(Project.id == project.id).options(selectinload(Project.members))
            )
            return _project_to_type(result.scalar_one())

    @strawberry.mutation
    async def update_project(self,
                             id: int,
                             title: str,
                             description: str,
                             member_emails: List[str],
                             picture_url: str) -> ProjectType:
        from .models import Project, ProjectMember
        from sqlalchemy.future import select
        from sqlalchemy.orm import selectinload
        async with AsyncSessionLocal() as db:
            project = await db.get(Project, id)
            if not project:
                raise ValueError(f"Project {id} not found")

            project.title = title
            project.description = description
            project.picture_url = picture_url

            # Soft-delete approach: keep members with chat history
            result = await db.execute(
                select(ProjectMember).where(ProjectMember.project_id == id)
            )
            existing = result.scalars().all()
            existing_map = {m.email: m for m in existing}
            new_email_set = set(member_emails)

            for email, member in existing_map.items():
                if email in new_email_set:
                    member.is_removed = False   # re-activate if was removed
                else:
                    member.is_removed = True    # soft-delete

            for email in new_email_set:
                if email not in existing_map:
                    db.add(ProjectMember(email=email, project_id=id, is_removed=False))

            await db.commit()

            result = await db.execute(
                select(Project).where(Project.id == id).options(selectinload(Project.members))
            )
            return _project_to_type(result.scalar_one())

    @strawberry.mutation
    async def delete_project(self, id: int) -> bool:
        from .models import Project, ProjectMember, Message
        from sqlalchemy import delete
        async with AsyncSessionLocal() as db:
            project = await db.get(Project, id)
            if project:
                await db.execute(delete(Message).where(Message.project_id == id))
                await db.execute(delete(ProjectMember).where(ProjectMember.project_id == id))
                await db.execute(delete(Project).where(Project.id == id))
                await db.commit()
                return True
            return False

    @strawberry.mutation
    async def send_message(self,
                           project_id: int,
                           member_email: str,
                           content: str,
                           sender: str = 'operator') -> MessageType:
        from .models import Message
        async with AsyncSessionLocal() as db:
            msg = Message(
                project_id=project_id,
                member_email=member_email,
                content=content,
                sender=sender,
                is_read=False,
            )
            db.add(msg)
            await db.commit()
            await db.refresh(msg)
            return _message_to_type(msg)

    @strawberry.mutation
    async def mark_messages_read(self, project_id: int, member_email: str, read_by: str = 'operator') -> bool:
        from .models import Message
        from sqlalchemy import update
        async with AsyncSessionLocal() as db:
            sender_to_mark = 'member' if read_by == 'operator' else 'operator'
            await db.execute(
                update(Message)
                .where(
                    Message.project_id == project_id,
                    Message.member_email == member_email,
                    Message.sender == sender_to_mark,
                )
                .values(is_read=True)
            )
            await db.commit()
            return True

    @strawberry.mutation
    async def update_last_online(self, project_id: int, email: str) -> bool:
        from .models import ProjectMember
        from sqlalchemy import update
        from datetime import datetime
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(ProjectMember)
                .where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.email == email
                )
                .values(last_online=datetime.utcnow())
            )
            await db.commit()
            return True

    @strawberry.mutation
    async def update_typing_status(self, project_id: int, email: str, is_typing: bool) -> bool:
        from .models import ProjectMember
        from sqlalchemy import update
        from datetime import datetime, timedelta
        async with AsyncSessionLocal() as db:
            until_val = datetime.utcnow() + timedelta(seconds=15) if is_typing else None
            await db.execute(
                update(ProjectMember)
                .where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.email == email
                )
                .values(typing_until=until_val, last_online=datetime.utcnow())
            )
            await db.commit()
            return True

    @strawberry.mutation
    async def update_operator_typing_status(self, project_id: int, email: str, is_typing: bool) -> bool:
        from .models import ProjectMember
        from sqlalchemy import update
        from datetime import datetime, timedelta
        async with AsyncSessionLocal() as db:
            until_val = datetime.utcnow() + timedelta(seconds=15) if is_typing else None
            await db.execute(
                update(ProjectMember)
                .where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.email == email
                )
                .values(operator_typing_until=until_val)
            )
            await db.commit()
            return True

    @strawberry.mutation
    async def upsert_agent(self, project_id: int, name: str, soul: str, gemini_api_key: Optional[str] = None) -> 'AgentType':
        from .models import Agent
        from sqlalchemy.future import select
        from datetime import datetime
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Agent).where(Agent.project_id == project_id)
            )
            agent = result.scalar_one_or_none()
            if agent:
                agent.name = name
                agent.soul = soul
                agent.gemini_api_key = gemini_api_key
                agent.updated_at = datetime.utcnow()
            else:
                agent = Agent(project_id=project_id, name=name, soul=soul, gemini_api_key=gemini_api_key)
                db.add(agent)
            await db.commit()
            await db.refresh(agent)
            return AgentType(id=agent.id, project_id=agent.project_id, name=agent.name, soul=agent.soul, gemini_api_key=agent.gemini_api_key)

schema = strawberry.Schema(query=Query, mutation=Mutation)

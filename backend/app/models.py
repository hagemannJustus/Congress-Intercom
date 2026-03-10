from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
from .database import Base

class MagicLink(Base):
    __tablename__ = "magic_links"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True, nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def is_expired(self):
        return datetime.utcnow() > self.expires_at

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100), nullable=False)
    picture_url = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    agent = relationship("Agent", back_populates="project", uselist=False, cascade="all, delete-orphan")

class ProjectMember(Base):
    __tablename__ = "project_members"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"))
    is_removed = Column(Boolean, default=False, nullable=False, server_default='0')
    last_online = Column(DateTime, nullable=True)
    typing_until = Column(DateTime, nullable=True)
    operator_typing_until = Column(DateTime, nullable=True)

    project = relationship("Project", back_populates="members")

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    member_email = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    # 'operator' = sent by the webapp user / agent
    # 'member' = sent by the mobile user
    sender = Column(String(20), nullable=False, default='operator')
    sent_at = Column(DateTime, default=datetime.utcnow)
    is_read = Column(Boolean, default=False, nullable=False, server_default='0')

class Agent(Base):
    __tablename__ = "agents"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    soul = Column(Text, nullable=False)
    gemini_api_key = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="agent")

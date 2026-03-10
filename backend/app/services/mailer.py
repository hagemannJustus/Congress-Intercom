import logging
import smtplib
from email.message import EmailMessage
import os
import asyncio

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def sync_send_email(to_email: str, subject: str, body: str):
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    smtp_from = os.getenv("SMTP_FROM", "noreply@magiclink.local")

    if not smtp_host:
        logger.warning("SMTP_HOST not set. Printing email to console instead.")
        logger.info(f"--- SIMULATED EMAIL SENT ---")
        logger.info(f"To: {to_email}\nSubject: {subject}\nBody:\n{body}")
        logger.info(f"---------------------------")
        return True

    msg = EmailMessage()
    msg.set_content(body)
    msg["Subject"] = subject
    msg["From"] = smtp_from
    msg["To"] = to_email

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls()
            if smtp_user and smtp_password:
                server.login(smtp_user, smtp_password)
            server.send_message(msg)
        logger.info(f"Successfully sent magic link email to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        raise e

async def send_magic_link_email(email: str, token: str):
    # Determine base URLs
    # We want the link to hit the backend verification or directly the frontend.
    # We will format it so it redirects to the backend which then redirects to the local app.
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
    if backend_url and not backend_url.startswith("http"):
        backend_url = f"https://{backend_url}"
    magic_link = f"{backend_url}/verify?token={token}"
    
    subject = "Your Magic Login Link"
    body = f"""Hello,

Click the link below to securely log into your account:
{magic_link}

If you did not request this link, please ignore this email.
"""

    # Run the synchronous smtplib in an executor to avoid blocking the async event loop
    await asyncio.to_thread(sync_send_email, email, subject, body)
    
    return True

import os
from dotenv import load_dotenv
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

load_dotenv()

logger = logging.getLogger("app")

# Base HTML Template for all emails
BASE_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
        .header {{ background-color: #1a3353; color: white; padding: 25px; text-align: center; }}
        .content {{ padding: 30px; background-color: #ffffff; border: 1px solid #eee; }}
        .footer {{ background-color: #f4f4f4; color: #777; padding: 15px; text-align: center; font-size: 12px; }}
        .otp-box {{ background-color: #f1f8fc; border: 2px dashed #1a3353; padding: 20px; font-size: 32px; font-weight: bold; text-align: center; letter-spacing: 5px; color: #1a3353; margin: 25px 0; border-radius: 8px; }}
        .highlight {{ color: #1a3353; font-weight: bold; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>{title}</h1>
    </div>
    <div class="content">
        <p>Dear {name},</p>
        <div style="font-size: 16px;">
            {body}
        </div>
        {action_section}
        <p style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
            If you did not request this, please ignore this email or contact support.
        </p>
        <p>Best regards,<br>The APEX Team</p>
    </div>
    <div class="footer">
        &copy; {year} APEX. All rights reserved.<br>
        Automated notification - do not reply.
    </div>
</body>
</html>
"""

class EmailService:
    @staticmethod
    def send_email(to_email: str, subject: str, title: str, name: str, body: str, action_text: str = None, is_otp: bool = False):
        try:
            # Check user preference from database
            from common.database.database import SessionLocal
            from common.models.db_models import User
            
            # List of reserved email addresses and domains to skip
            reserved_emails = ["admin@example.com"]
            reserved_domains = ["example.com", "example.net", "example.org", ".example", ".test", ".invalid", ".localhost"]
            
            email_lower = to_email.lower()
            if email_lower in reserved_emails or any(email_lower.endswith(domain) for domain in reserved_domains):
                logger.info(f"Email skipped for {to_email} as it is a reserved/example address: {subject}")
                return True # Return True to indicate it was "handled"

            db = SessionLocal()
            try:
                user = db.query(User).filter(User.email == to_email).first()
                if user and hasattr(user, 'email_notifications') and not user.email_notifications:
                    logger.info(f"Email skipped for {to_email} due to user preference: {subject}")
                    return True # Return True to indicate it was "handled"
            except Exception as db_err:
                logger.error(f"Error checking user preference for {to_email}: {db_err}")
            finally:
                db.close()

            msg = MIMEMultipart()
            msg['From'] = os.getenv("EMAIL_USER")
            msg['To'] = to_email
            msg['Subject'] = subject

            # Only show OTP box, remove button links as per requirement
            action_section = ""
            if is_otp and action_text:
                action_section = f'<div class="otp-box">{action_text}</div>'

            from datetime import datetime
            html_content = BASE_TEMPLATE.format(
                title=title,
                name=name,
                body=body,
                action_section=action_section,
                year=datetime.now().year
            )

            msg.attach(MIMEText(html_content, 'html'))

            smtp_server = os.getenv("SMTP_SERVER")
            smtp_port = int(os.getenv("SMTP_PORT"))
            email_user = os.getenv("EMAIL_USER")
            email_pass = os.getenv("EMAIL_PASS")

            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(email_user, email_pass)
                server.send_message(msg)
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
        except Exception as e:
            logger.error(f"Error sending email to {to_email}: {e}")
            return False

    @classmethod
    def send_registration_otp(cls, email: str, otp: str):
        return cls.send_email(
            to_email=email,
            subject="Verification Code for Registration - APEX",
            title="Account Verification",
            name="User",
            body="Use the following OTP to complete your registration process. This code is valid for 5 minutes.",
            action_text=otp,
            is_otp=True
        )

    @classmethod
    def send_forgot_password_otp(cls, email: str, username: str, otp: str):
        return cls.send_email(
            to_email=email,
            subject="Verification Code for Password Reset - APEX",
            title="Password Reset Request",
            name=username,
            body="We received a request to reset your password. Use the following OTP to proceed.",
            action_text=otp,
            is_otp=True
        )

    @classmethod
    def send_admin_new_user_notification(cls, admin_email: str, user_email: str, username: str):
        return cls.send_email(
            to_email=admin_email,
            subject="Action Required: New User Registration - APEX",
            title="New User Alert",
            name="Administrator",
            body=f"A new user <span class='highlight'>{username}</span> ({user_email}) has registered and is pending approval."
        )

    @classmethod
    def send_user_pending_approval(cls, email: str, username: str):
        return cls.send_email(
            to_email=email,
            subject="Registration Successful - Pending Approval - APEX",
            title="Registration Received",
            name=username,
            body="Your email has already registered. Your account is currently <span class='highlight'>waiting for admins approval</span>. You will be notified via email once your account is active."
        )

    @classmethod
    def send_approval_notification(cls, email: str, username: str, role: str):
        return cls.send_email(
            to_email=email,
            subject="Welcome to APEX! Account Approved",
            title="Account Activated",
            name=username,
            body=f"Your account has been approved by the administrator. You have been assigned the role: <span class='highlight'>{role}</span>. You can now log in to the system."
        )

    @classmethod
    def send_approval_request_email(cls, email: str, username: str, vendor_name: str, invoice_number: str, amount: str, currency: str):
        body = f"""
        An invoice requires your approval:
        <br><br>
        <span class='highlight'>Vendor:</span> {vendor_name}<br>
        <span class='highlight'>Invoice #:</span> {invoice_number}<br>
        <span class='highlight'>Amount:</span> {amount} {currency}
        <br><br>
        Please log in to the APEX portal to review and take action.
        """
        return cls.send_email(
            to_email=email,
            subject=f"Approval Required: Invoice {invoice_number} from {vendor_name}",
            title="Invoice Approval Request",
            name=username,
            body=body
        )

    @classmethod
    def send_approval_reminder_email(cls, email: str, username: str, vendor_name: str, invoice_number: str, amount: str, currency: str, pending_days: int):
        body = f"""
        This is a reminder that an invoice has been pending your approval 
        <br><br>
        <span class='highlight'>Vendor:</span> {vendor_name}<br>
        <span class='highlight'>Invoice #:</span> {invoice_number}<br>
        <span class='highlight'>Amount:</span> {amount} {currency}
        <br><br>
        Please log in to the APEX portal as soon as possible to review and take action.
        """
        return cls.send_email(
            to_email=email,
            subject=f"Reminder: Approval Required for Invoice {invoice_number} from {vendor_name}",
            title="Invoice Approval Reminder",
            name=username,
            body=body
        )

    @classmethod
    def send_rejection_notification(cls, email: str, username: str, vendor_name: str, invoice_number: str, status: str, comment: str):
        status_label = "Rejected" if status.lower() == "rejected" else "Rework"
        body = f"""
        Your submitted invoice has been <span class='highlight'>{status_label}</span>:
        <br><br>
        <span class='highlight'>Vendor:</span> {vendor_name}<br>
        <span class='highlight'>Invoice #:</span> {invoice_number}<br>
        <span class='highlight'>Approver Comment:</span> {comment or "No comment provided."}
        <br><br>
        Please log in to the APEX portal to review and address the issues.
        """
        return cls.send_email(
            to_email=email,
            subject=f"Action Required: Invoice {invoice_number} {status_label}",
            title=f"Invoice {status_label}",
            name=username,
            body=body
        )

    @classmethod
    def send_hoa_approval_request_email(cls, email: str, username: str, vendor_name: str, invoice_number: str, amount: str, currency: str, submitted_by: str = "HOA User"):
        body = f"""
        An invoice has been submitted by <span class='highlight'>{submitted_by}</span> and is awaiting your <b>HOA Approval</b>:
        <br><br>
        <span class='highlight'>Vendor:</span> {vendor_name}<br>
        <span class='highlight'>Invoice #:</span> {invoice_number}<br>
        <span class='highlight'>Amount:</span> {amount} {currency}<br>
        <span class='highlight'>Stage:</span> HOA Approval
        <br><br>
        Please log in to the APEX portal to review and take action.
        """
        return cls.send_email(
            to_email=email,
            subject=f"Action Required: HOA Approval for Invoice {invoice_number} - {vendor_name}",
            title="HOA Approval Request",
            name=username,
            body=body
        )

    @classmethod
    def send_ap_coding_request_email(cls, email: str, username: str, vendor_name: str, invoice_number: str, amount: str, currency: str, approved_by: str = "HOA Approver"):
        body = f"""
        An invoice has been approved by HOA Approver <span class='highlight'>{approved_by}</span> and is now awaiting your <b>Codification</b>:
        <br><br>
        <span class='highlight'>Vendor:</span> {vendor_name}<br>
        <span class='highlight'>Invoice #:</span> {invoice_number}<br>
        <span class='highlight'>Amount:</span> {amount} {currency}<br>
        <span class='highlight'>Stage:</span> AP Coding
        <br><br>
        Please log in to the APEX portal to code this invoice.
        """
        return cls.send_email(
            to_email=email,
            subject=f"Action Required: Codification Required for Invoice {invoice_number} - {vendor_name}",
            title="Invoice Codification Request",
            name=username,
            body=body
        )

    @classmethod
    def send_ap_approval_request_email(cls, email: str, username: str, vendor_name: str, invoice_number: str, amount: str, currency: str, coded_by: str = "AP User"):
        body = f"""
        An invoice has been coded by AP User <span class='highlight'>{coded_by}</span> and is now awaiting your <b>AP Approval</b>:
        <br><br>
        <span class='highlight'>Vendor:</span> {vendor_name}<br>
        <span class='highlight'>Invoice #:</span> {invoice_number}<br>
        <span class='highlight'>Amount:</span> {amount} {currency}<br>
        <span class='highlight'>Stage:</span> AP Approval
        <br><br>
        Please log in to the APEX portal to review and provide final approval.
        """
        return cls.send_email(
            to_email=email,
            subject=f"Action Required: AP Approval for Invoice {invoice_number} - {vendor_name}",
            title="AP Approval Request",
            name=username,
            body=body
        )

    @classmethod
    def send_invoice_approved_notification(cls, email: str, username: str, vendor_name: str, invoice_number: str, amount: str, currency: str, approved_by: str = "AP Approver", bill_number: str = None):
        bill_info = f"<br><span class='highlight'>ERP Bill #:</span> {bill_number}" if bill_number else ""
        body = f"""
        The following invoice has been approved by AP Approver <span class='highlight'>{approved_by}</span>:
        <br><br>
        <span class='highlight'>Vendor:</span> {vendor_name}<br>
        <span class='highlight'>Invoice #:</span> {invoice_number}<br>
        <span class='highlight'>Amount:</span> {amount} {currency}{bill_info}<br>
        <span class='highlight'>Status:</span> Approved
        <br><br>
        No further action is required.
        """
        return cls.send_email(
            to_email=email,
            subject=f"Invoice {invoice_number} from {vendor_name} Approved",
            title="Invoice Approved",
            name=username,
            body=body
        )

    @classmethod
    def _extract_invoice_meta(cls, invoice):
        """Extract vendor name, invoice number, amount, and currency safely from invoice."""
        import json
        extracted = {}
        if invoice.extracted_data:
            try:
                extracted = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
            except Exception:
                extracted = {}

        vendor_name = (
            invoice.vendor_name or 
            extracted.get("vendor_info", {}).get("name", {}).get("value") or 
            "Unknown Vendor"
        )
        invoice_number = (
            extracted.get("invoice_details", {}).get("invoice_number", {}).get("value") or 
            invoice.invoice_number or 
            "N/A"
        )
        currency = extracted.get("invoice_details", {}).get("currency", {}).get("value") or "USD"

        total_amt = invoice.total_amount
        if total_amt is None:
            raw_amt = extracted.get("invoice_details", {}).get("total_amount", {}).get("value")
            amount_str = str(raw_amt) if raw_amt is not None else "0.00"
        else:
            try:
                amount_str = f"{float(total_amt):,.2f}"
            except Exception:
                amount_str = str(total_amt)

        return vendor_name, invoice_number, amount_str, currency

    @classmethod
    def notify_stage_hoa_approvers(cls, invoice_id: int, submitted_by: str = "HOA User"):
        """Notify all active HOA Approvers that an invoice was submitted by HOA User."""
        from common.database.database import SessionLocal
        from common.models.db_models import User, Invoice

        db = SessionLocal()
        try:
            invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
            if not invoice:
                logger.warning(f"[EmailService] Invoice {invoice_id} not found for HOA approver notification")
                return

            vendor_name, invoice_number, amount, currency = cls._extract_invoice_meta(invoice)

            # Find all active HOA Approvers
            users = db.query(User).filter(User.status == "active", User.role.isnot(None)).all()
            hoa_approvers = [
                u for u in users 
                if u.email and "hoa" in (u.role or "").lower() and "approver" in (u.role or "").lower()
            ]

            logger.info(f"[EmailService] Sending HOA approval request for invoice {invoice_id} to {len(hoa_approvers)} approvers")
            for approver in hoa_approvers:
                cls.send_hoa_approval_request_email(
                    email=approver.email,
                    username=approver.username or "HOA Approver",
                    vendor_name=vendor_name,
                    invoice_number=invoice_number,
                    amount=amount,
                    currency=currency,
                    submitted_by=submitted_by
                )
        except Exception as e:
            logger.error(f"[EmailService] Error notifying HOA approvers for invoice {invoice_id}: {e}")
        finally:
            db.close()

    @classmethod
    def notify_stage_ap_users(cls, invoice_id: int, approved_by: str = "HOA Approver"):
        """Notify all active AP Users that an invoice was approved by HOA Approver and needs codification."""
        from common.database.database import SessionLocal
        from common.models.db_models import User, Invoice

        db = SessionLocal()
        try:
            invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
            if not invoice:
                logger.warning(f"[EmailService] Invoice {invoice_id} not found for AP user notification")
                return

            vendor_name, invoice_number, amount, currency = cls._extract_invoice_meta(invoice)

            # Find all active AP Users / Coders
            users = db.query(User).filter(User.status == "active", User.role.isnot(None)).all()
            ap_users = [
                u for u in users 
                if u.email and (("ap" in (u.role or "").lower() and "user" in (u.role or "").lower()) or "coder" in (u.role or "").lower())
            ]

            logger.info(f"[EmailService] Sending AP codification request for invoice {invoice_id} to {len(ap_users)} AP users")
            for ap_user in ap_users:
                cls.send_ap_coding_request_email(
                    email=ap_user.email,
                    username=ap_user.username or "AP User",
                    vendor_name=vendor_name,
                    invoice_number=invoice_number,
                    amount=amount,
                    currency=currency,
                    approved_by=approved_by
                )
        except Exception as e:
            logger.error(f"[EmailService] Error notifying AP users for invoice {invoice_id}: {e}")
        finally:
            db.close()

    @classmethod
    def notify_stage_ap_approvers(cls, invoice_id: int, coded_by: str = "AP User"):
        """Notify AP Approvers that an invoice has been coded and needs AP approval."""
        from common.database.database import SessionLocal
        from common.models.db_models import User, Invoice, InvoiceAssignedApprover

        db = SessionLocal()
        try:
            invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
            if not invoice:
                logger.warning(f"[EmailService] Invoice {invoice_id} not found for AP approver notification")
                return

            vendor_name, invoice_number, amount, currency = cls._extract_invoice_meta(invoice)

            # 1. Collect assigned approvers if any
            target_emails = set()
            assigned_records = db.query(InvoiceAssignedApprover).filter(
                InvoiceAssignedApprover.invoice_id == invoice_id
            ).all()
            for r in assigned_records:
                if r.approver_email:
                    target_emails.add(r.approver_email.lower())

            # 2. Collect all active users with role AP APPROVER
            users = db.query(User).filter(User.status == "active", User.role.isnot(None)).all()
            ap_approvers = [
                u for u in users 
                if u.email and "ap" in (u.role or "").lower() and "approver" in (u.role or "").lower() and "hoa" not in (u.role or "").lower()
            ]
            for u in ap_approvers:
                target_emails.add(u.email.lower())

            # Build recipient list with usernames
            user_map = {u.email.lower(): u.username for u in users if u.email}

            logger.info(f"[EmailService] Sending AP approval request for invoice {invoice_id} to {len(target_emails)} approvers")
            for email in target_emails:
                username = user_map.get(email, "AP Approver")
                cls.send_ap_approval_request_email(
                    email=email,
                    username=username,
                    vendor_name=vendor_name,
                    invoice_number=invoice_number,
                    amount=amount,
                    currency=currency,
                    coded_by=coded_by
                )
        except Exception as e:
            logger.error(f"[EmailService] Error notifying AP approvers for invoice {invoice_id}: {e}")
        finally:
            db.close()

    @classmethod
    def notify_stage_invoice_approved(cls, invoice_id: int, approved_by: str = "AP Approver", bill_number: str = None):
        """Notify HOA user (uploader) and AP user (coder) that invoice has been approved."""
        from common.database.database import SessionLocal
        from common.models.db_models import User, Invoice, WorkflowStep, WorkflowStepTypeEnum

        db = SessionLocal()
        try:
            invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
            if not invoice:
                return

            vendor_name, invoice_number, amount, currency = cls._extract_invoice_meta(invoice)
            target_emails = set()

            # Find uploader / HOA user
            if invoice.uploaded_by:
                uploader = db.query(User).filter(
                    (User.username == invoice.uploaded_by) | (User.email == invoice.uploaded_by)
                ).first()
                if uploader and uploader.email:
                    target_emails.add((uploader.email.lower(), uploader.username))
                elif "@" in invoice.uploaded_by:
                    target_emails.add((invoice.uploaded_by.lower(), invoice.uploaded_by))

            # Find coder / AP user
            coding_step = db.query(WorkflowStep).filter(
                WorkflowStep.invoice_id == invoice_id,
                WorkflowStep.step_type.in_([WorkflowStepTypeEnum.CODING, "coding"])
            ).order_by(WorkflowStep.timestamp.desc()).first()
            if coding_step and coding_step.user:
                coder = db.query(User).filter(
                    (User.username == coding_step.user) | (User.email == coding_step.user)
                ).first()
                if coder and coder.email:
                    target_emails.add((coder.email.lower(), coder.username))

            logger.info(f"[EmailService] Sending invoice approved notification for invoice {invoice_id} to {len(target_emails)} recipients")
            for email, username in target_emails:
                cls.send_invoice_approved_notification(
                    email=email,
                    username=username,
                    vendor_name=vendor_name,
                    invoice_number=invoice_number,
                    amount=amount,
                    currency=currency,
                    approved_by=approved_by,
                    bill_number=bill_number
                )
        except Exception as e:
            logger.error(f"[EmailService] Error notifying approved invoice {invoice_id}: {e}")
        finally:
            db.close()

    @classmethod
    def notify_stage_invoice_reworked(cls, invoice_id: int, reworked_by: str, comment: str, rework_to: str = "HOA User"):
        """Notify user that invoice has been returned for rework."""
        from common.database.database import SessionLocal
        from common.models.db_models import User, Invoice, WorkflowStep, WorkflowStepTypeEnum

        db = SessionLocal()
        try:
            invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
            if not invoice:
                return

            vendor_name, invoice_number, _, _ = cls._extract_invoice_meta(invoice)
            target_email = None
            target_name = "User"

            if rework_to.lower() == "hoa user":
                if invoice.uploaded_by:
                    uploader = db.query(User).filter(
                        (User.username == invoice.uploaded_by) | (User.email == invoice.uploaded_by)
                    ).first()
                    if uploader and uploader.email:
                        target_email = uploader.email
                        target_name = uploader.username
                    elif "@" in invoice.uploaded_by:
                        target_email = invoice.uploaded_by
            else:
                coding_step = db.query(WorkflowStep).filter(
                    WorkflowStep.invoice_id == invoice_id,
                    WorkflowStep.step_type.in_([WorkflowStepTypeEnum.CODING, "coding"])
                ).order_by(WorkflowStep.timestamp.desc()).first()
                if coding_step and coding_step.user:
                    coder = db.query(User).filter(
                        (User.username == coding_step.user) | (User.email == coding_step.user)
                    ).first()
                    if coder and coder.email:
                        target_email = coder.email
                        target_name = coder.username

            if target_email:
                cls.send_rejection_notification(
                    email=target_email,
                    username=target_name,
                    vendor_name=vendor_name,
                    invoice_number=invoice_number,
                    status="Rework",
                    comment=comment
                )
        except Exception as e:
            logger.error(f"[EmailService] Error notifying rework for invoice {invoice_id}: {e}")
        finally:
            db.close()

    @classmethod
    def notify_stage_invoice_rejected(cls, invoice_id: int, rejected_by: str, comment: str):
        """Notify submitter and coder that invoice has been rejected."""
        from common.database.database import SessionLocal
        from common.models.db_models import User, Invoice, WorkflowStep, WorkflowStepTypeEnum

        db = SessionLocal()
        try:
            invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
            if not invoice:
                return

            vendor_name, invoice_number, _, _ = cls._extract_invoice_meta(invoice)
            targets = set()

            if invoice.uploaded_by:
                uploader = db.query(User).filter(
                    (User.username == invoice.uploaded_by) | (User.email == invoice.uploaded_by)
                ).first()
                if uploader and uploader.email:
                    targets.add((uploader.email, uploader.username))
                elif "@" in invoice.uploaded_by:
                    targets.add((invoice.uploaded_by, invoice.uploaded_by))

            coding_step = db.query(WorkflowStep).filter(
                WorkflowStep.invoice_id == invoice_id,
                WorkflowStep.step_type.in_([WorkflowStepTypeEnum.CODING, "coding"])
            ).order_by(WorkflowStep.timestamp.desc()).first()
            if coding_step and coding_step.user:
                coder = db.query(User).filter(
                    (User.username == coding_step.user) | (User.email == coding_step.user)
                ).first()
                if coder and coder.email:
                    targets.add((coder.email, coder.username))

            for email, username in targets:
                cls.send_rejection_notification(
                    email=email,
                    username=username,
                    vendor_name=vendor_name,
                    invoice_number=invoice_number,
                    status="Rejected",
                    comment=comment
                )
        except Exception as e:
            logger.error(f"[EmailService] Error notifying rejection for invoice {invoice_id}: {e}")
        finally:
            db.close()



email_service = EmailService()

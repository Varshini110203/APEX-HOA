import asyncio
import logging
import json
from datetime import datetime, timedelta
from typing import List, Tuple, Optional
from sqlalchemy.orm import Session
from common.database.database import SessionLocal
from common.models.db_models import Invoice, InvoiceAssignedApprover, User, WorkflowStep, InvoiceStatusEnum
from common.utils.settings import get_app_settings
from common.utils.date_utils import get_ist_now
from common.routes.approval_new import (
    _steps_for_invoice,
    _get_current_cycle_steps,
    _parse_list,
    _get_finance_users,
    _record_step
)
from common.services.email_service import email_service

logger = logging.getLogger("app")

# All pending / actionable statuses across the APEX-HOA workflow
ACTIONABLE_STATUSES = [
    InvoiceStatusEnum.WAITING_HOA_APPROVAL,
    InvoiceStatusEnum.WAITING_CODING,
    InvoiceStatusEnum.WAITING_AP_APPROVAL,
    InvoiceStatusEnum.WAITING_APPROVAL,
    InvoiceStatusEnum.PROCESSED,
    InvoiceStatusEnum.REWORKED,
    InvoiceStatusEnum.SAGE_POSTED,
    InvoiceStatusEnum.PROCESSED_PAYMENT,
    InvoiceStatusEnum.PAID,
    InvoiceStatusEnum.PAID_PAYMENT,
    InvoiceStatusEnum.SAGE_POST_FAILED,
]


def _get_workflow_recipients_for_invoice(
    db: Session,
    invoice: Invoice,
    current_cycle_steps: list
) -> Tuple[List[Tuple[str, str]], Optional[str], Optional[str], Optional[str]]:
    """
    Determine the target recipients, descriptive status label, action needed,
    and reminder step name for an invoice based on its current workflow status.
    
    Returns:
        (recipients, status_label, action_required, reminder_step_name)
        where recipients is a list of (email, username) tuples.
    """
    status_raw = invoice.status.value if hasattr(invoice.status, "value") else str(invoice.status)
    status_clean = str(status_raw).lower()

    # 1. WAITING HOA APPROVAL -> HOA Approvers
    if status_clean == "waiting_hoa_approval":
        active_users = db.query(User).filter(User.status == "active", User.role.isnot(None)).all()
        recipients = [
            (u.email.lower(), u.username or "HOA Approver")
            for u in active_users
            if u.email and "hoa" in (u.role or "").lower() and "approver" in (u.role or "").lower()
        ]
        return (
            recipients,
            "Waiting for HOA Approval",
            "Review and approve/reject/rework the HOA invoice submission",
            "HOA Approval Reminder"
        )

    # 2. WAITING CODING -> AP Coder / AP User
    elif status_clean == "waiting_coding":
        active_users = db.query(User).filter(User.status == "active", User.role.isnot(None)).all()
        recipients = [
            (u.email.lower(), u.username or "AP User")
            for u in active_users
            if u.email and (("ap" in (u.role or "").lower() and "user" in (u.role or "").lower()) or "coder" in (u.role or "").lower())
        ]
        return (
            recipients,
            "Waiting for Codification",
            "Code GL lines, verify invoice details, and send for AP approval",
            "AP Coding Reminder"
        )

    # 3. WAITING AP APPROVAL / WAITING APPROVAL -> Assigned Approvers
    elif status_clean in ("waiting_ap_approval", "waiting_approval"):
        assigned_approvers = db.query(InvoiceAssignedApprover).filter(
            InvoiceAssignedApprover.invoice_id == invoice.id,
            InvoiceAssignedApprover.sequence_order == invoice.current_approver_level
        ).all()

        emails = []
        is_finance = False
        for a in assigned_approvers:
            if a.is_finance:
                is_finance = True
            if a.approver_email:
                emails.append(a.approver_email.strip())

        if is_finance:
            finance_emails = _get_finance_users(db, invoice.entity)
            emails = list(set(emails) | set(finance_emails))

        # Exclude approvers who already approved in current cycle
        already_acted_emails = {
            s.user.lower() for s in (current_cycle_steps or [])
            if s.user and s.step_type in {
                "approved", "level_approved", "threshold_approved", "posting_approved"
            }
        }
        pending_emails = [e for e in emails if e.lower() not in already_acted_emails]

        recipients = []
        if pending_emails:
            for e in pending_emails:
                u = db.query(User).filter(User.email == e).first()
                recipients.append((e.lower(), u.username if u else "AP Approver"))
        else:
            # Fallback to active AP approvers if no specific sequence approvers found
            active_users = db.query(User).filter(User.status == "active", User.role.isnot(None)).all()
            recipients = [
                (u.email.lower(), u.username or "AP Approver")
                for u in active_users
                if u.email and "ap" in (u.role or "").lower() and "approver" in (u.role or "").lower()
            ]
        return (
            recipients,
            "Waiting for AP Approval",
            "Review and approve/reject/rework the coded invoice",
            "AP Approval Reminder"
        )

    # 4. PROCESSED (Uploaded, pending HOA user details & submission)
    elif status_clean == "processed":
        recipients = []
        if invoice.uploaded_by:
            uploader = db.query(User).filter(
                (User.username == invoice.uploaded_by) | (User.email == invoice.uploaded_by)
            ).first()
            if uploader and uploader.email:
                recipients.append((uploader.email.lower(), uploader.username or "HOA User"))
            elif "@" in invoice.uploaded_by:
                recipients.append((invoice.uploaded_by.lower(), invoice.uploaded_by))
        if not recipients:
            active_users = db.query(User).filter(User.status == "active", User.role.isnot(None)).all()
            recipients = [
                (u.email.lower(), u.username or "HOA User")
                for u in active_users
                if u.email and "hoa" in (u.role or "").lower() and "approver" not in (u.role or "").lower()
            ]
        return (
            recipients,
            "Processed / Pending Submission",
            "Complete HOA fields and submit invoice for HOA approval",
            "HOA Submission Reminder"
        )

    # 5. REWORKED -> HOA User or AP Coder based on who was sent the rework
    elif status_clean == "reworked":
        rework_step = db.query(WorkflowStep).filter(
            WorkflowStep.invoice_id == invoice.id,
            (WorkflowStep.step_type == "reworked") | (WorkflowStep.step_name.ilike("%rework%"))
        ).order_by(WorkflowStep.timestamp.desc()).first()

        is_hoa_rework = False
        if rework_step:
            step_desc = f"{rework_step.step_name or ''} {rework_step.comment or ''}".lower()
            if "hoa" in step_desc:
                is_hoa_rework = True

        recipients = []
        if is_hoa_rework:
            if invoice.uploaded_by:
                uploader = db.query(User).filter(
                    (User.username == invoice.uploaded_by) | (User.email == invoice.uploaded_by)
                ).first()
                if uploader and uploader.email:
                    recipients.append((uploader.email.lower(), uploader.username or "HOA User"))
                elif "@" in invoice.uploaded_by:
                    recipients.append((invoice.uploaded_by.lower(), invoice.uploaded_by))
            if not recipients:
                active_users = db.query(User).filter(User.status == "active", User.role.isnot(None)).all()
                recipients = [
                    (u.email.lower(), u.username or "HOA User")
                    for u in active_users
                    if u.email and "hoa" in (u.role or "").lower() and "approver" not in (u.role or "").lower()
                ]
            return (
                recipients,
                "Rework Required (HOA User)",
                "Review rework feedback, update HOA fields, and resubmit for approval",
                "HOA Rework Reminder"
            )
        else:
            coding_step = db.query(WorkflowStep).filter(
                WorkflowStep.invoice_id == invoice.id,
                WorkflowStep.step_type.in_(["coding", "ap_coded"])
            ).order_by(WorkflowStep.timestamp.desc()).first()
            if coding_step and coding_step.user:
                coder = db.query(User).filter(
                    (User.username == coding_step.user) | (User.email == coding_step.user)
                ).first()
                if coder and coder.email:
                    recipients.append((coder.email.lower(), coder.username or "AP Coder"))
                elif "@" in coding_step.user:
                    recipients.append((coding_step.user.lower(), coding_step.user))
            if not recipients:
                active_users = db.query(User).filter(User.status == "active", User.role.isnot(None)).all()
                recipients = [
                    (u.email.lower(), u.username or "AP Coder")
                    for u in active_users
                    if u.email and (("ap" in (u.role or "").lower() and "user" in (u.role or "").lower()) or "coder" in (u.role or "").lower())
                ]
            return (
                recipients,
                "Rework Required (AP Coder)",
                "Review rework feedback, update GL coding details, and resubmit for approval",
                "AP Rework Reminder"
            )

    # 6. SAGE POSTED -> All AP Users & AR Users
    elif status_clean == "sage_posted":
        recipients_map = {}
        active_users = db.query(User).filter(User.status == "active", User.role.isnot(None)).all()
        for u in active_users:
            if not u.email:
                continue
            role_str = (u.role or "").lower().replace("_", " ")
            roles = [r.strip() for r in role_str.split(",")]
            # All active AP Users (who can process payment)
            if any(r in ["ap user", "ap", "coder"] or ("ap" in r.split() and "approver" not in r) for r in roles):
                recipients_map[u.email.lower()] = u.username or "AP User"
            # All active AR Users
            elif any(r in ["ar user", "ar"] or ("ar" in r.split() and "approver" not in r) for r in roles):
                recipients_map[u.email.lower()] = u.username or "AR User"

        recipients = list(recipients_map.items())
        return (
            recipients,
            "Posted to ERP / Pending Payment",
            "Process invoice payment and record payment confirmation",
            "Payment Processing Reminder"
        )

    # 7. PROCESSED PAYMENT -> AP User to add attachment and mark paid
    elif status_clean == "processed_payment":
        recipients_map = {}
        active_users = db.query(User).filter(User.status == "active", User.role.isnot(None)).all()
        for u in active_users:
            role_str = (u.role or "").lower().replace("_", " ")
            roles = [r.strip() for r in role_str.split(",")]
            if any("ap" in r.split() and "approver" not in r for r in roles) or "ap user" in roles:
                recipients_map[u.email.lower()] = u.username or "AP User"
        recipients = list(recipients_map.items())
        return (
            recipients,
            "Payment Processed / Pending Paid Confirmation",
            "Upload payment attachment and mark invoice as paid",
            "Payment Paid Confirmation Reminder"
        )

    # 8. PAID -> HOA User to close request
    elif status_clean in ("paid", "paid_payment"):
        recipients = []
        if invoice.uploaded_by:
            uploader = db.query(User).filter(
                (User.username == invoice.uploaded_by) | (User.email == invoice.uploaded_by)
            ).first()
            if uploader and uploader.email:
                recipients.append((uploader.email.lower(), uploader.username or "HOA User"))
            elif "@" in invoice.uploaded_by:
                recipients.append((invoice.uploaded_by.lower(), invoice.uploaded_by))
        if not recipients:
            active_users = db.query(User).filter(User.status == "active", User.role.isnot(None)).all()
            recipients = [
                (u.email.lower(), u.username or "HOA User")
                for u in active_users
                if u.email and "hoa" in (u.role or "").lower() and "approver" not in (u.role or "").lower()
            ]
        return (
            recipients,
            "Paid / Pending Request Closure",
            "Review paid invoice and close request",
            "Request Closure Reminder"
        )

    # 8. SAGE POST FAILED -> AP Approver & Finance Team
    elif status_clean == "sage_post_failed":
        active_users = db.query(User).filter(User.status == "active", User.role.isnot(None)).all()
        recipients_map = {}
        for u in active_users:
            if u.email and "ap" in (u.role or "").lower() and "approver" in (u.role or "").lower():
                recipients_map[u.email.lower()] = u.username or "AP Approver"

        if invoice.entity:
            finance_emails = _get_finance_users(db, invoice.entity)
            for fe in finance_emails:
                recipients_map[fe.lower()] = "Finance Team"

        return (
            list(recipients_map.items()),
            "ERP Post Failed",
            "Review posting error, enable editing/correct details, and repost to ERP",
            "ERP Post Failed Reminder"
        )

    return ([], None, None, None)


async def check_approval_reminders():
    """
    Checks all pending workflow invoices across all actionable statuses and sends
    reminders to the respective responsible actors if the invoice has been idle
    for at least `reminder_days`.
    """
    db = SessionLocal()
    try:
        settings_data = get_app_settings(db)
        reminder_days = settings_data.get("reminder_days", 3)
        try:
            reminder_days = int(reminder_days)
        except (ValueError, TypeError):
            reminder_days = 3

        if reminder_days <= 0:
            logger.info("[Reminders] reminder_days is <= 0. Skipping reminders.")
            return

        now = get_ist_now()
        cutoff = now - timedelta(days=reminder_days)

        # Map actionable status enum values and their string representations
        actionable_status_values = [
            s.value if hasattr(s, "value") else str(s)
            for s in ACTIONABLE_STATUSES
        ]

        # Query all invoices in any actionable status updated at or before the cutoff
        invoices = db.query(Invoice).filter(
            Invoice.status.in_(actionable_status_values),
            Invoice.updated_at <= cutoff
        ).all()

        logger.info(f"[Reminders] Found {len(invoices)} candidate invoices pending for >= {reminder_days} days.")

        for invoice in invoices:
            try:
                steps = _steps_for_invoice(db, invoice.id)
                current_cycle_steps = _get_current_cycle_steps(steps)

                # Determine last non-reminder activity time
                if current_cycle_steps:
                    non_reminder_steps = [s for s in current_cycle_steps if s.step_type != "reminder"]
                    if non_reminder_steps:
                        last_action_time = non_reminder_steps[-1].timestamp
                    else:
                        last_action_time = invoice.updated_at or invoice.uploaded_at or now
                else:
                    last_action_time = invoice.updated_at or invoice.uploaded_at or now

                elapsed = now - last_action_time
                if elapsed.total_seconds() < reminder_days * 86400:
                    continue

                # Rate limiting: max once every 24 hours (or interval) per invoice
                already_reminded = False
                for s in reversed(steps):
                    if s.step_type == "reminder":
                        if (now - s.timestamp).total_seconds() < min(24 * 3600, reminder_days * 86400):
                            already_reminded = True
                            break

                if already_reminded:
                    continue

                # Determine target recipients and context for this specific status
                recipients, status_label, action_required, reminder_step_name = _get_workflow_recipients_for_invoice(
                    db=db,
                    invoice=invoice,
                    current_cycle_steps=current_cycle_steps
                )

                if not recipients or not status_label:
                    continue

                # Fetch amount and currency
                total_amount = invoice.total_amount
                if total_amount is None:
                    try:
                        from common.routes.workflow import get_invoice_total_from_invoice
                        total_amount = get_invoice_total_from_invoice(db, invoice.id)
                    except Exception:
                        total_amount = 0.0

                currency = invoice.currency or "USD"
                vendor_name = invoice.vendor_name or "Unknown Vendor"
                invoice_number = invoice.invoice_number or invoice.reference_number or f"REQ-{invoice.id}"

                logger.info(
                    f"[Reminders] Sending reminder for invoice {invoice.id} ({status_label}) to: {[r[0] for r in recipients]}"
                )

                sent_emails = []
                for email, username in recipients:
                    if not email:
                        continue
                    success = email_service.send_workflow_reminder_email(
                        email=email,
                        username=username,
                        vendor_name=vendor_name,
                        invoice_number=invoice_number,
                        amount=str(total_amount),
                        currency=currency,
                        pending_days=reminder_days,
                        status_label=status_label,
                        action_required=action_required
                    )
                    if success:
                        sent_emails.append(email)

                # Record reminder step in audit/workflow history
                if sent_emails:
                    _record_step(
                        db=db,
                        invoice_id=invoice.id,
                        step_name=reminder_step_name,
                        step_type="reminder",
                        user_email="system",
                        status="sent",
                        approver_number=invoice.current_approver_level,
                        comment=f"Reminder sent ({status_label}) to: {', '.join(sent_emails)}",
                        entity=invoice.entity
                    )
                    db.commit()

            except Exception as inv_err:
                logger.error(f"[Reminders] Error processing reminders for invoice {invoice.id}: {inv_err}")
                db.rollback()

    except Exception as e:
        logger.error(f"[Reminders] Error checking workflow reminders: {e}")
    finally:
        db.close()


async def start_reminder_scheduler():
    logger.info("[Reminders] Starting workflow reminder background loop...")
    while True:
        try:
            await check_approval_reminders()
        except Exception as err:
            logger.error(f"[Reminders] Error in reminder scheduler: {err}")
        # Run check every 1 hour (3600 seconds)
        await asyncio.sleep(3600)

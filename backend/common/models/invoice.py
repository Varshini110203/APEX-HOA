from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional, Dict, Any, List, Union
from datetime import datetime, date
from enum import Enum

class InvoiceStatus(str, Enum):
    WAITING_CODING = "waiting_coding"
    WAITING_APPROVAL = "waiting_approval"
    WAITING_HOA_APPROVAL = "waiting_hoa_approval"
    WAITING_AP_APPROVAL = "waiting_ap_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    PROCESSED = "processed"
    UPLOADING = "uploading"
    REWORKED = "reworked"
    SAGE_POSTED = "sage_posted"
    SAGE_POST_FAILED = "sage_post_failed"
    ARCHIVED = "archived"
    DELETED = "deleted"

class StatusHistoryItem(BaseModel):
    status: InvoiceStatus
    user: str
    timestamp: datetime
    comment: Optional[str] = None

class InvoiceBase(BaseModel):
    request_id: Optional[str] = None
    filename: str
    original_filename: str
    file_path: str
    uploaded_by: str
    status: InvoiceStatus = InvoiceStatus.WAITING_APPROVAL
    status_label: Optional[str] = None
    status_history: Optional[List[StatusHistoryItem]] = []
    required_approvers: Optional[int] = None
    is_parallel: Optional[bool] = False
    approver_breakdown: Optional[Dict[str, Any]] = None
    entity: Optional[str] = None
    approved_by: Optional[List[str]] = []
    assigned_approvers: Optional[List[Any]] = []
    current_approver_level: Optional[int] = 1
    gl_summary: Optional[List[Dict[str, Any]]] = None
    exchange_rate: Optional[float] = None
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    invoice_number: Optional[str] = None
    reference_number: Optional[str] = None
    vendor_code: Optional[str] = None
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    posting_date: Optional[date] = None
    total_amount: Optional[float] = None
    amount_due: Optional[float] = None
    payment_terms: Optional[str] = None
    payment_method: Optional[str] = None
    any_fee_applicable: Optional[str] = None
    fee_amount: Optional[float] = None
    expense_type: Optional[str] = None
    payment_reference: Optional[str] = None
    expense_category: Optional[str] = None
    loan_number: Optional[str] = None
    last_modified_by: Optional[str] = None
    approver: Optional[str] = None
    attachments: Optional[Any] = None

class InvoiceCreate(InvoiceBase):
    pass

class InvoiceUpdate(BaseModel):
    request_id: Optional[str] = None
    extracted_data: Optional[Dict[str, Any]] = None
    status: Optional[InvoiceStatus] = None
    status_history: Optional[List[Dict[str, Any]]] = None
    validation_results: Optional[Dict[str, Any]] = None
    exchange_rate: Optional[Any] = None
    invoice_date: Optional[Any] = None
    due_date: Optional[Any] = None
    posting_date: Optional[Any] = None
    total_amount: Optional[Any] = None
    amount_due: Optional[Any] = None
    vendor_id: Optional[str] = None
    vendor_code: Optional[str] = None
    vendor_name: Optional[str] = None
    invoice_number: Optional[str] = None
    reference_number: Optional[str] = None
    payment_terms: Optional[str] = None
    payment_term: Optional[str] = None
    payment_method: Optional[str] = None
    any_fee_applicable: Optional[str] = None
    fee_amount: Optional[Any] = None
    expense_type: Optional[str] = None
    payment_reference: Optional[str] = None
    expense_category: Optional[str] = None
    loan_number: Optional[str] = None
    last_updated_at: Optional[datetime] = None

class Invoice(InvoiceBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: Union[str, int]
    extracted_data: Optional[Dict[str, Any]] = None
    processing_steps: Optional[List[str]] = None
    validation_results: Optional[Dict[str, Any]] = None
    confidence_score: Optional[str] = None
    uploaded_at: datetime
    processed_at: Optional[datetime] = None
    duplicate_info: Optional[Dict[str, Any]] = None
    original_items: Optional[List[Dict[str, Any]]] = None
    updated_at: Optional[datetime] = None

class InvoiceResponse(Invoice):
    pass

class InvoicePaginatedResponse(BaseModel):
    data: List[InvoiceResponse]
    total: int
    page: int
    page_size: int
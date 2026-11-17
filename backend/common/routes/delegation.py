from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime

from common.database.database import get_db
from common.models.db_models import Delegation as DBDelegation
from common.repository.repositories import delegation_repo
from common.auth.jwt import get_current_user
from common.dependencies import get_current_entity
from common.models.user import UserResponse
from common.models.delegation import DelegationCreate, DelegationResponse, DelegationPaginatedResponse

router = APIRouter()

@router.post("/", response_model=DelegationResponse)
async def create_delegation(
    delegation: DelegationCreate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    # Validation
    if delegation.original_approver.lower() == delegation.substitute_approver.lower():
        raise HTTPException(400, "Original approver and substitute approver cannot be the same.")
    
    user_roles = [r.strip().lower() for r in (current_user.role or "").split(",")]
    if "admin" not in user_roles and current_user.email.lower() != delegation.original_approver.lower():
        raise HTTPException(403, "You do not have permission to delegate this user's approvals.")

    # Role matching validation: HOA approver -> HOA approver, AP approver -> AP approver
    from common.models.db_models import User as DBUser
    from sqlalchemy import func
    orig_user = db.query(DBUser).filter(func.lower(DBUser.email) == delegation.original_approver.lower()).first()
    sub_user = db.query(DBUser).filter(func.lower(DBUser.email) == delegation.substitute_approver.lower()).first()
    if orig_user and sub_user:
        orig_role = (orig_user.role or "").lower()
        sub_role = (sub_user.role or "").lower()
        orig_dept = (orig_user.department or "").lower()
        sub_dept = (sub_user.department or "").lower()

        orig_is_hoa = "hoa" in orig_role or "hoa" in orig_dept
        sub_is_hoa = "hoa" in sub_role or "hoa" in sub_dept

        orig_is_ap = ("ap" in orig_role or "finance" in orig_role or "ap" in orig_dept or "finance" in orig_dept) and not orig_is_hoa
        sub_is_ap = ("ap" in sub_role or "finance" in sub_role or "ap" in sub_dept or "finance" in sub_dept) and not sub_is_hoa

        if orig_is_hoa and not sub_is_hoa:
            raise HTTPException(400, "An HOA Approver can only be substituted by another HOA Approver.")
        if orig_is_ap and not sub_is_ap:
            raise HTTPException(400, "An AP Approver can only be substituted by another AP Approver.")

    # Overlap validation: s1 <= e2 AND e1 >= s2
    overlap_list = delegation_repo.get_multi(
        db,
        filters={
            "original_approver": delegation.original_approver.lower(),
            "entity": entity
        },
        expressions=[
            DBDelegation.start_date <= delegation.end_date,
            DBDelegation.end_date >= delegation.start_date
        ],
        limit=1
    )
    existing_overlap = overlap_list[0] if overlap_list else None
    
    if existing_overlap:
        raise HTTPException(
            status_code=400, 
            detail=f"An active or scheduled delegation already exists for this approver in the selected period ({existing_overlap.start_date} to {existing_overlap.end_date})."
        )

    new_del_data = {
        "delegator_email": delegation.original_approver.lower(),
        "substitute_email": delegation.substitute_approver.lower(),
        "is_active": True,
        "original_approver": delegation.original_approver.lower(),
        "substitute_approver": delegation.substitute_approver.lower(),
        "start_date": delegation.start_date,
        "end_date": delegation.end_date,
        "entity": entity,
        "created_at": datetime.utcnow(),
        "created_by": current_user.email
    }
    new_del = delegation_repo.create(db, obj_in=new_del_data)
    
    return DelegationResponse(
        id=new_del.id,
        original_approver=new_del.original_approver,
        substitute_approver=new_del.substitute_approver,
        start_date=new_del.start_date,
        end_date=new_del.end_date,
        entity=new_del.entity,
        created_at=new_del.created_at,
        created_by=new_del.created_by
    )

@router.get("/", response_model=DelegationPaginatedResponse)
async def get_delegations(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    skip: int = 0,
    limit: int = 15,
    search: str = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc"
):
    search_fields = ["original_approver", "substitute_approver"]
    
    paginated_res = delegation_repo.get_paginated(
        db,
        skip=skip,
        limit=limit,
        filters={"entity": entity},
        search=search,
        search_fields=search_fields,
        order_by=sort_by,
        descending=(sort_dir.lower() == 'desc')
    )
    return paginated_res

@router.delete("/{delegation_id}")
async def delete_delegation(
    delegation_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    delegation = delegation_repo.get(db, delegation_id)
    if not delegation:
        raise HTTPException(404, "Delegation not found")
    
    print(f"DEBUG REVERT: User={current_user.email} Role={current_user.role} CreatedBy={delegation.created_by} Orig={delegation.original_approver}")

    user_roles = [r.strip().lower() for r in (current_user.role or "").split(",")]
    if "admin" not in user_roles and \
       current_user.email.lower() != (delegation.created_by or "").lower() and \
       current_user.email.lower() != (delegation.original_approver or "").lower():
        raise HTTPException(403, "You do not have permission to revert this delegation.")
        
    delegation_repo.remove(db, id=delegation_id)
    return {"message": "Delegation reverted successfully"}

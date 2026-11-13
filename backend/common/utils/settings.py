from sqlalchemy.orm import Session
from common.database.database import get_db
from common.models.db_models import GlobalSetting
from common.repository.repositories import global_setting_repo
import json

DEFAULT_SETTINGS = {
    "roles": ["HOA USER", "HOA APPROVER", "AP USER", "AP APPROVER", "AR USER", "admin"],
    "statuses": ["active", "pending", "rejected"],
    "navigation": [
        {"label": "Dashboard", "path": "/dashboard", "roles": ["all"]},
        {"label": "Coding", "path": "/coding", "roles": ["AP USER"]},
        {"label": "Invoices", "path": "/invoices", "roles": ["HOA USER", "HOA APPROVER", "AP USER", "AP APPROVER", "AR USER", "admin"]},
        {"label": "Approvals", "path": "/approvals", "roles": ["HOA APPROVER", "AP APPROVER"]},
        {"label": "Master Data", "path": "/master-data", "roles": ["admin"]},
        {"label": "Settings", "path": "/settings", "roles": ["admin"]},
        {"label": "Admin", "path": "/admin", "roles": ["admin"]}
    ],
    "reminder_days": 3
}

def get_app_settings(db: Session = None):
    """
    Retrieve application settings from the database.
    Returns default settings if not found in DB.
    """
    # Create session if not provided
    close_session = False
    if db is None:
        from common.database.database import SessionLocal
        db = SessionLocal()
        close_session = True
    
    try:
        setting_list = global_setting_repo.get_multi(db, filters={"setting_key": "app_settings"}, limit=1)
        setting = setting_list[0] if setting_list else None
        
        if not setting or not setting.setting_value:
            return DEFAULT_SETTINGS.copy()
        
        # Parse JSON value
        try:
            settings_data = json.loads(setting.setting_value) if isinstance(setting.setting_value, str) else setting.setting_value
        except (json.JSONDecodeError, TypeError):
            return DEFAULT_SETTINGS.copy()
        
        # Merge with defaults to ensure all keys exist
        merged_settings = DEFAULT_SETTINGS.copy()
        
        # Special handling for navigation: merge lists by label to ensure defaults are always present
        if "navigation" in settings_data:
            db_nav = settings_data["navigation"]
            default_nav = DEFAULT_SETTINGS["navigation"]
            
            nav_dict = {item.get("label"): item for item in default_nav if isinstance(item, dict) and "label" in item}
            for item in db_nav:
                # DB item wins if there is a conflict, but defaults fill the gaps
                if isinstance(item, dict) and "label" in item:
                    nav_dict[item["label"]] = item
                
            merged_settings["navigation"] = list(nav_dict.values())
        
        # Update other keys (roles, statuses, etc.)
        other_settings = {k: v for k, v in settings_data.items() if k != "navigation"}
        merged_settings.update(other_settings)
        
        # Clean up deprecated roles and ensure all new roles exist
        if "roles" in merged_settings and isinstance(merged_settings["roles"], list):
            # Filter out deprecated roles 'coding', 'coder', 'approver', 'scanner'
            merged_settings["roles"] = [
                r for r in merged_settings["roles"]
                if r.lower() not in ["coding", "coder", "approver", "scanner"]
            ]
            # Ensure new roles exist
            for role_name in DEFAULT_SETTINGS["roles"]:
                if not any(r.lower() == role_name.lower() for r in merged_settings["roles"]):
                    merged_settings["roles"].append(role_name)

        # Ensure 'Coding' navigation entry exists for AP USER
        if "navigation" in merged_settings and isinstance(merged_settings["navigation"], list):
            coding_nav = next((nav for nav in merged_settings["navigation"] if isinstance(nav, dict) and (nav.get("label") == "Coding" or nav.get("path") == "/coding")), None)
            if not coding_nav:
                merged_settings["navigation"].insert(1, {"label": "Coding", "path": "/coding", "roles": ["AP USER"]})
            else:
                coding_roles = coding_nav.get("roles", [])
                if "AP USER" not in coding_roles:
                    coding_roles.append("AP USER")
                coding_nav["roles"] = coding_roles

        # Clean up navigation roles
        if "navigation" in merged_settings and isinstance(merged_settings["navigation"], list):
            for nav in merged_settings["navigation"]:
                if isinstance(nav, dict) and "roles" in nav and isinstance(nav["roles"], list):
                    updated_roles = []
                    for r in nav["roles"]:
                        if r.lower() in ["coding", "coder"]:
                            for new_r in ["HOA USER", "AP USER", "AR USER"]:
                                if new_r not in updated_roles:
                                    updated_roles.append(new_r)
                        elif r.lower() == "approver":
                            for new_r in ["HOA APPROVER", "AP APPROVER"]:
                                if new_r not in updated_roles:
                                    updated_roles.append(new_r)
                        elif r.lower() not in ["coding", "coder", "approver", "scanner"]:
                            if r not in updated_roles:
                                updated_roles.append(r)
                    # For admin do not display approvals tab
                    if nav.get("label") == "Approvals":
                        updated_roles = [r for r in updated_roles if r.lower() != "admin"]
                    nav["roles"] = updated_roles

        # If settings were updated during cleanup/migration, persist them back to DB
        if setting:
            new_setting_val = json.dumps(merged_settings)
            if setting.setting_value != new_setting_val:
                try:
                    setting.setting_value = new_setting_val
                    from datetime import datetime
                    setting.updated_at = datetime.utcnow()
                    db.commit()
                except Exception as e:
                    db.rollback()
        
        return merged_settings
    finally:
        if close_session:
            db.close()


def sync_roles_and_settings(db: Session = None):
    """
    Synchronize global settings and database users with the new roles:
    HOA USER, HOA APPROVER, AP USER, AP APPROVER, AR USER, admin.
    Removes legacy roles (coder, approver) from settings and migrates users.
    """
    close_session = False
    if db is None:
        from common.database.database import SessionLocal
        db = SessionLocal()
        close_session = True

    try:
        from common.models.db_models import User, GlobalSetting
        from datetime import datetime

        # 1. Update app_settings in DB
        setting = db.query(GlobalSetting).filter(GlobalSetting.setting_key == "app_settings").first()
        new_val = json.dumps(DEFAULT_SETTINGS)
        if not setting:
            setting = GlobalSetting(
                setting_key="app_settings",
                setting_value=new_val,
                updated_at=datetime.utcnow()
            )
            db.add(setting)
        else:
            setting.setting_value = new_val
            setting.updated_at = datetime.utcnow()

        # 2. Migrate existing users with coding, coder or approver role
        users = db.query(User).all()
        for u in users:
            if not u.role:
                continue
            r_lower = u.role.strip().lower()
            if r_lower in ["coder", "coding"]:
                u.role = "HOA USER"
            elif r_lower == "approver":
                u.role = "HOA APPROVER"
            elif "coder" in r_lower or "coding" in r_lower or "approver" in r_lower:
                new_roles = []
                for part in u.role.split(","):
                    p = part.strip()
                    if p.lower() in ["coder", "coding"]:
                        new_roles.append("HOA USER")
                    elif p.lower() == "approver":
                        new_roles.append("HOA APPROVER")
                    else:
                        new_roles.append(p)
                u.role = ",".join(new_roles)

       

        db.commit()
        print("✓ Synchronized global settings and users with new roles successfully")
    except Exception as e:
        db.rollback()
        print(f"✗ Failed to sync roles and settings: {e}")
    finally:
        if close_session:
            db.close()

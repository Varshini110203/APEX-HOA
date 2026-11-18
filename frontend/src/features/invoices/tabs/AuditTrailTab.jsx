import React, { useMemo, memo } from "react";
import { 
    CheckOutlined, 
    EditOutlined, 
    UploadOutlined, 
    ArrowRightOutlined, 
    CloseOutlined, 
    UndoOutlined,
    CloudUploadOutlined,
    ExclamationCircleOutlined,
    LoadingOutlined,
    HistoryOutlined
} from "@ant-design/icons";
import { getAuditflowSync } from "../../hooks/useWorkflow";
import { useInvoiceStore } from "../../../store/invoice.store";
import { Spin, Empty } from "antd";
import dayjs from "dayjs";
import { formatIST } from "../../../utils/formatters";

// ─────────────────────────────────────────────────────────────────────────────
// STATIC CONFIGURATION (Outside component to prevent re-creation)
// ─────────────────────────────────────────────────────────────────────────────
const EVENT_CONFIG = {
    uploaded: { iconBg: "#75a3ecff", labelBg: "#DBEAFE", labelColor: "#1E40AF", lineBg: "#14C9B1", icon: <UploadOutlined className="text-[12px] text-white" /> },
    updated: { iconBg: "#b69cf4ff", labelBg: "#EDE9FE", labelColor: "#5B21B6", lineBg: "#14C9B1", icon: <EditOutlined className="text-[12px] text-white" /> },
    coding_saved: { iconBg: "#89e4d8ff", labelBg: "#E1F5EE", labelColor: "#0F6E56", lineBg: "#14C9B1", icon: <CheckOutlined className="text-[12px] text-white" /> },
    sent_for_coding: { iconBg: "#89e4d8ff", labelBg: "#DBEAFE", labelColor: "#1E40AF", lineBg: "#14C9B1", icon: <ArrowRightOutlined className="text-[10px] text-white" /> },
    sent_to_approval: { iconBg: "#a1d8faff", labelBg: "#DBEAFE", labelColor: "#1E40AF", lineBg: "#14C9B1", icon: <ArrowRightOutlined className="text-[10px] text-white" /> },
    approved: { iconBg: "#10B981", labelBg: "#D1FAE5", labelColor: "#065F46", lineBg: "#14C9B1", icon: <CheckOutlined className="text-[12px] text-white" /> },
    rejected: { iconBg: "#EF4444", labelBg: "#FEE2E2", labelColor: "#991B1B", lineBg: "#14C9B1", icon: <CloseOutlined className="text-[12px] text-white" /> },
    reworked: { iconBg: "#ea92e7ff", labelBg: "#FEF3C7", labelColor: "#92400E", lineBg: "#14C9B1", icon: <UndoOutlined className="text-[12px] text-white" /> },
    recalled: { iconBg: "#F59E0B", labelBg: "#FEF3C7", labelColor: "#92400E", lineBg: "#14C9B1", icon: <UndoOutlined className="text-[12px] text-white" /> },
    sage_posted: { iconBg: "#10B981", labelBg: "#D1FAE5", labelColor: "#065F46", lineBg: "#14C9B1", icon: <CloudUploadOutlined className="text-[12px] text-white" /> },
    sage_failed: { iconBg: "#EF4444", labelBg: "#FEE2E2", labelColor: "#991B1B", lineBg: "#14C9B1", icon: <ExclamationCircleOutlined className="text-[12px] text-white" /> },
    sage_reposted: { iconBg: "#f379e4ff", labelBg: "#E1F5EE", labelColor: "#0F6E56", lineBg: "#14C9B1", icon: <CloudUploadOutlined className="text-[12px] text-white" /> },
    deleted: { iconBg: "#EF4444", labelBg: "#FEE2E2", labelColor: "#991B1B", lineBg: "#14C9B1", icon: <CloseOutlined className="text-[12px] text-white" /> }
};

const ARROW_ICON = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="inline mx-1 text-gray-400">
        <polyline points="9 18 15 12 9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <polyline points="15 18 21 12 15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

const mapActionToUIKey = (action) => {
    if (!action) return "updated";
    const actionLower = action.toLowerCase();
    if (actionLower.includes("uploaded")) return "uploaded";
    if (actionLower.includes("updated")) return "updated";
    if (actionLower.includes("coding saved")) return "coding_saved";
    if (actionLower.includes("sent for coding")) return "sent_for_coding";
    if (actionLower.includes("sent for approval")) return "sent_to_approval";
    if (actionLower.includes("approved")) return "approved";
    if (actionLower.includes("rejected")) return "rejected";
    if (actionLower.includes("reworked")) return "reworked";
    if (actionLower.includes("recalled")) return "recalled";
    if (actionLower.includes("posted")) return "sage_posted";
    if (actionLower.includes("failure") || actionLower.includes("failed")) return "sage_failed";
    if (actionLower.includes("reposted")) return "sage_reposted";
    if (actionLower.includes("deleted")) return "deleted";
    return "updated";
};

const formatDetailLabel = (key) => {
    if (!key) return "";
    const lower = key.toLowerCase();
    if (lower === "error" || lower === "reason" || lower === "failure_reason") {
        return "Reason for Failure";
    }
    if (lower === "repost_attempt" || lower === "attempt") {
        return "Repost Attempt";
    }
    if (lower === "repost_count") {
        return "Total Reposts";
    }
    return key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
};

// ─────────────────────────────────────────────────────────────────────────────
// MEMOIZED SUB-COMPONENT: AuditItem
// ─────────────────────────────────────────────────────────────────────────────
const AuditItem = memo(({ item, isLast }) => {
    const uiKey = useMemo(() => mapActionToUIKey(item.action), [item.action]);
    const config = EVENT_CONFIG[uiKey] || EVENT_CONFIG.updated;

    const details = useMemo(() => {
        let rawDetails = item.details;
        if (typeof rawDetails === "string" && rawDetails.trim().startsWith("{")) {
            try { rawDetails = JSON.parse(rawDetails); } catch (e) { return []; }
        }
        if (!rawDetails || typeof rawDetails !== "object") return [];

        const seenFailureValues = new Set();
        const entries = [];

        for (const [key, val] of Object.entries(rawDetails)) {
            if (val && typeof val === "object" && "old" in val && "new" in val) {
                entries.push({ key, label: key, oldValue: val.old, newValue: val.new });
            } else {
                const strVal = String(val);
                const lowerKey = key.toLowerCase();
                if (lowerKey === "error" || lowerKey === "reason" || lowerKey === "failure_reason") {
                    if (seenFailureValues.has(strVal)) continue;
                    seenFailureValues.add(strVal);
                }
                entries.push({ key, label: key, value: strVal });
            }
        }
        return entries;
    }, [item.details]);

    const formattedTime = useMemo(() => {
        return formatIST(item.timestamp);
    }, [item.timestamp]);

    return (
        <div className="flex gap-4 group">
            <div className="flex flex-col items-center">
                <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm transition-transform group-hover:scale-105"
                    style={{ background: config.iconBg, color: "#ffffff" }}
                >
                    {config.icon}
                </div>
                {!isLast && (
                    <div 
                        className="w-[2px] flex-1 mt-1 mb-1 rounded-full opacity-30"
                        style={{ minHeight: "40px", background: config.lineBg }}
                    />
                )}
            </div>

            <div className="pb-8 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span 
                        className="text-[11px] font-bold px-2 py-[2px] rounded uppercase tracking-wider shadow-sm"
                        style={{ background: config.labelBg, color: config.labelColor }}
                    >
                        {item.action}
                    </span>
                    <span className="text-[13px] font-semibold text-gray-800">{item.user}</span>
                    <span className="text-[12px] text-gray-400">{formattedTime}</span>
                </div>

                {details.length > 0 && (
                    <div className={`mt-2 ${uiKey === 'sage_failed' ? 'bg-red-50/40 border-red-200 text-red-950' : 'bg-gray-50 border-gray-100 text-gray-600'} border rounded-md px-4 py-3 text-[13px] space-y-2`}>
                        {details.map((d) => (
                            <div key={d.key} className="flex items-start flex-wrap gap-x-2 gap-y-1">
                                <span className={`font-semibold whitespace-nowrap ${uiKey === 'sage_failed' && (d.key.toLowerCase().includes('reason') || d.key.toLowerCase().includes('error')) ? 'text-red-700' : 'text-gray-500'}`}>
                                    {formatDetailLabel(d.label)} :
                                </span>
                                {d.oldValue !== undefined ? (
                                    <div className="flex items-center flex-wrap gap-1">
                                        <span className="line-through text-gray-300 italic">
                                            {(!d.oldValue && d.oldValue !== 0) ? "none" : String(d.oldValue)}
                                        </span>
                                        {ARROW_ICON}
                                        <span className="text-gray-800 font-semibold bg-white px-1.5 py-0.5 rounded border border-gray-100 shadow-sm">
                                            {(!d.newValue && d.newValue !== 0) ? "none" : String(d.newValue)}
                                        </span>
                                    </div>
                                ) : (
                                    <span className={`font-medium whitespace-pre-wrap ${uiKey === 'sage_failed' && (d.key.toLowerCase().includes('reason') || d.key.toLowerCase().includes('error')) ? 'text-red-900 font-semibold' : 'text-gray-800'}`}>
                                        {d.value === "null" ? "None" : d.value}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                
                {item.comment && !details.some(d => d.key === "comment") && (
                    <div className="mt-2 text-[12px] italic text-gray-400 bg-gray-50/50 p-2 rounded border border-dashed border-gray-100">
                        "{item.comment}"
                    </div>
                )}
            </div>
        </div>
    );
});

AuditItem.displayName = "AuditItem";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const AuditTrailTab = () => {
    // Precise state-selector for better performance
    const { viewInvoiceId, activeInvoiceData } = useInvoiceStore();
    const isArchived = activeInvoiceData?.is_archived;

    const { 
        getAuditData: fetchedAuditData, 
        isAuditLoading, 
        isAuditError 
    } = getAuditflowSync(!isArchived ? viewInvoiceId : null);

    const getAuditData = isArchived 
        ? activeInvoiceData.audit_logs || [] 
        : fetchedAuditData;

    const content = useMemo(() => {
        if (isAuditLoading) {
            return (
                <div className="h-[400px] flex flex-col items-center justify-center gap-3">
                    <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                    <span className="text-gray-400 text-sm animate-pulse">Loading audit trail...</span>
                </div>
            );
        }

        if (isAuditError) {
            return (
                <div className="h-[400px] flex flex-col items-center justify-center gap-3">
                    <ExclamationCircleOutlined className="text-red-400 text-3xl" />
                    <span className="text-gray-500 font-medium">Failed to load audit trail</span>
                </div>
            );
        }

        if (!getAuditData?.length) {
            return (
                <div className="h-[400px] flex flex-col items-center justify-center">
                    <Empty description="No audit history found for this invoice" />
                </div>
            );
        }

        // Chronological count for attempt numbering
        const chronological = [...getAuditData].reverse();
        let repostCounter = 0;
        const attemptMap = new Map();

        for (const log of chronological) {
            const act = (log.action || "").toLowerCase();
            if (act.includes("repost")) {
                repostCounter++;
                attemptMap.set(log.id || log.timestamp, repostCounter);
            }
        }

        const processedList = getAuditData.map(log => {
            let action = log.action || "";
            const idKey = log.id || log.timestamp;
            const attempt = attemptMap.get(idKey);
            if (attempt && !action.toLowerCase().includes("attempt") && !action.includes("#")) {
                action = `${action} (Attempt ${attempt})`;
            }
            return {
                ...log,
                action
            };
        });

        return (
            <div className="space-y-0">
                {processedList.map((item, index) => (
                    <AuditItem 
                        key={item.id || index} 
                        item={item} 
                        isLast={index === processedList.length - 1} 
                    />
                ))}
            </div>
        );
    }, [getAuditData, isAuditLoading, isAuditError]);

    return (
        <div className="bg-white p-6 overflow-y-auto max-h-[calc(100vh-250px)] scroll-smooth">
            {content}
        </div>
    );
};

export default memo(AuditTrailTab);
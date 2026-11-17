import React, { useMemo } from "react";
import { 
    CheckOutlined, 
    ClockCircleOutlined, 
    CloseOutlined, 
    RollbackOutlined 
} from "@ant-design/icons";
import { useInvoiceStore } from "../../../store/invoice.store";
import { useAuthStore } from "../../../store/authStore";
import { useWorkflowDataSync, getAuditflowSync } from "../../hooks/useWorkflow";
import { formatIST } from "../../../utils/formatters";

const getStatusConfig = (status) => {
    switch (status?.toLowerCase()) {
        case "completed":
        case "sage_posted":
        case "approved":
            return {
                titleColor: "text-[#1AB394]",
                subtitleColor: "text-gray-600",
                timeColor: "text-gray-400",
                icon: (
                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[#1AB394]">
                        <CheckOutlined className="!text-white text-[10px] font-black" />
                    </div>
                ),
                lineColor: "bg-[#1AB394]",
                lineStyle: "solid",
                defaultSubtitle: "Completed"
            };
        case "waiting":
        case "pending":
            return {
                titleColor: "text-[#8A6D3B]",
                subtitleColor: "text-gray-600",
                timeColor: "text-gray-400",
                icon: (
                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[#F8AC59]">
                        <ClockCircleOutlined className="!text-white text-[11px] font-black" />
                    </div>
                ),
                lineColor: "bg-gray-200",
                lineStyle: "dashed",
                defaultSubtitle: "Waiting"
            };
        case "rejected":
            return {
                titleColor: "text-[#ED5565]",
                subtitleColor: "text-gray-600",
                timeColor: "text-gray-400",
                icon: (
                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[#ED5565]">
                        <CloseOutlined className="!text-white text-[10px] font-black" />
                    </div>
                ),
                lineColor: "bg-gray-200",
                lineStyle: "dashed",
                defaultSubtitle: "Rejected"
            };
        case "reworked":
            return {
                titleColor: "text-[#F8AC59]",
                subtitleColor: "text-gray-600",
                timeColor: "text-gray-400",
                icon: (
                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[#F8AC59]">
                        <RollbackOutlined className="!text-white text-[10px] font-black" />
                    </div>
                ),
                lineColor: "bg-gray-200",
                lineStyle: "dashed",
                defaultSubtitle: "Sent for Rework"
            };
        case "queued":
        case "upcoming":
        default:
            return {
                titleColor: "text-gray-400",
                subtitleColor: "text-gray-400",
                timeColor: "text-gray-300",
                icon: (
                    <div className="w-6 h-6 border-2 border-gray-200 rounded-full bg-white" />
                ),
                lineColor: "bg-gray-200",
                lineStyle: "dashed",
                defaultSubtitle: "In Queue"
            };
    }
};

const WorkflowTab = () => {
    const { viewInvoiceId, activeInvoiceData } = useInvoiceStore();
    const currentUser = useAuthStore((state) => state.user);
    const isArchived = activeInvoiceData?.is_archived;

    const {
        workflowData: liveWorkflowData,
        isLoadingWorkflowData,
    } = useWorkflowDataSync(!isArchived ? viewInvoiceId : null, {});

    const { getAuditData } = getAuditflowSync(!isArchived ? viewInvoiceId : null);

    const auditLogsList = useMemo(() => {
        return Array.isArray(getAuditData) ? getAuditData : [];
    }, [getAuditData]);

    const auditHoaSubmitLogs = useMemo(() => {
        return auditLogsList.filter(a => {
            if (!a || !a.details) return false;
            const strDetails = typeof a.details === "string" ? a.details : JSON.stringify(a.details);
            return strDetails.includes("waiting_hoa_approval");
        });
    }, [auditLogsList]);

    const auditApSubmitLogs = useMemo(() => {
        return auditLogsList.filter(a => {
            if (!a || !a.details) return false;
            const strDetails = typeof a.details === "string" ? a.details : JSON.stringify(a.details);
            return strDetails.includes("waiting_ap_approval") || strDetails.includes("waiting_approval");
        });
    }, [auditLogsList]);

    const historySteps = useMemo(() => {
        const live = liveWorkflowData?.steps;
        if (Array.isArray(live) && live.length > 0) return live;
        const fromActive = activeInvoiceData?.workflow_steps;
        if (Array.isArray(fromActive) && fromActive.length > 0) return fromActive;
        return [];
    }, [liveWorkflowData?.steps, activeInvoiceData?.workflow_steps]);

    const userNamesMap = useMemo(() => {
        return {
            ...(activeInvoiceData?.user_names || {}),
            ...(liveWorkflowData?.user_names || {})
        };
    }, [liveWorkflowData?.user_names, activeInvoiceData?.user_names]);

    if (isLoadingWorkflowData) {
        return <div className="p-10 text-gray-400 font-normal">Loading workflow stages...</div>;
    }

    const currentStatus = (
        liveWorkflowData?.current_status ||
        activeInvoiceData?.status ||
        "processed"
    ).toLowerCase();

    const getUserDisplayName = (emailOrUsername) => {
        if (!emailOrUsername) return "";
        const raw = String(emailOrUsername).trim();
        const key = raw.toLowerCase();
        if (userNamesMap[key]) return userNamesMap[key];
        if (key.includes("@")) {
            const local = key.split("@")[0];
            return local
                .replace(/[._]/g, " ")
                .replace(/\b\w/g, c => c.toUpperCase());
        }
        return raw;
    };

    const formatStepTime = (dateVal) => {
        if (!dateVal) return null;
        const formatted = formatIST(dateVal);
        return formatted === "-" ? null : formatted;
    };

    // ── 1. Processed (Initial Ingest / Upload) ──
    const initialProcessedStep = historySteps.find(s => {
        const type = (s.step_type || "").toLowerCase();
        const name = (s.step_name || "").toLowerCase();
        if (type === "reworked" || name.includes("rework")) return false;
        return (type === "processed" || name.includes("process")) &&
               !name.includes("hoa user") &&
               !name.includes("hoa submit");
    });

    const processedActor = initialProcessedStep?.user || activeInvoiceData?.uploaded_by || "System";
    const step1 = {
        title: "Processed",
        status: "completed",
        subtitle: getUserDisplayName(processedActor),
        time: formatStepTime(initialProcessedStep?.timestamp || activeInvoiceData?.uploaded_at || activeInvoiceData?.processed_at),
        comment: initialProcessedStep?.comment
    };

    // ── HOA Stage Identification ──
    const isHoaApprove = (s) => {
        const type = (s.step_type || "").toLowerCase();
        const name = (s.step_name || "").toLowerCase();
        return type === "hoa_approved" || name.includes("hoa approv") || name.includes("hoa approval");
    };

    const hoaApproveStep = historySteps.find(isHoaApprove);
    const hoaApproveTime = hoaApproveStep ? new Date(hoaApproveStep.timestamp).getTime() : Infinity;

    // HOA Rework steps: explicit rework at HOA stage or before HOA approval
    const hoaReworkSteps = historySteps.filter(s => {
        const type = (s.step_type || "").toLowerCase();
        const name = (s.step_name || "").toLowerCase();
        const comment = (s.comment || "").toLowerCase();
        if (type !== "reworked") return false;
        if (name.includes("hoa") || comment.includes("hoa")) return true;
        const stepTime = s.timestamp ? new Date(s.timestamp).getTime() : 0;
        return stepTime < hoaApproveTime;
    });

    const hoaRejectStep = historySteps.find(s => {
        const type = (s.step_type || "").toLowerCase();
        const name = (s.step_name || "").toLowerCase();
        const comment = (s.comment || "").toLowerCase();
        if (type !== "rejected") return false;
        return name.includes("hoa") || comment.includes("hoa") || (!hoaApproveStep);
    });

    // Valid HOA User submission steps (MUST NOT include rework steps like "Sent for Rework to HOA User")
    const isHoaSubmitStep = (s) => {
        const type = (s.step_type || "").toLowerCase();
        const name = (s.step_name || "").toLowerCase();
        if (type === "reworked" || name.includes("rework")) return false;
        if (type === "rejected" || name.includes("reject")) return false;
        if (type === "hoa_approved" || name.includes("approv")) return false;
        return name.includes("hoa user") || 
               name.includes("hoa submit") || 
               name.includes("submitted");
    };

    const hoaSubmitSteps = historySteps.filter(isHoaSubmitStep);

    // Helpers to guard actor identities
    const isApproverName = (name) => {
        if (!name) return true;
        const n = String(name).toLowerCase().trim();
        return n.includes("janani") || n.includes("pricilla") || n.includes("jagadhish") || n.includes("approv") || n.includes("system") || n.includes("admin") || n === "hoa user" || n === "ap user" || n === "waiting" || n === "-" || n === "in queue";
    };

    const getHoaUserDisplayName = (name) => {
        if (name && !isApproverName(name)) {
            const dn = getUserDisplayName(name);
            if (dn && !isApproverName(dn)) return dn;
        }
        return "Lokesh";
    };

    // Identify primary HOA user name from history, audit logs, or invoice uploader
    const rawDefaultHoaUser = 
        hoaSubmitSteps.slice().reverse().find(s => s.user && !isApproverName(s.user))?.user || 
        auditHoaSubmitLogs.slice().reverse().find(a => a.user && !isApproverName(a.user))?.user ||
        (initialProcessedStep?.user && !isApproverName(initialProcessedStep.user) ? initialProcessedStep.user : null) || 
        (activeInvoiceData?.uploaded_by && !isApproverName(activeInvoiceData.uploaded_by) ? activeInvoiceData.uploaded_by : null) || 
        "Lokesh";
    const defaultHoaUser = getHoaUserDisplayName(rawDefaultHoaUser);

    // ── Build HOA Steps (including rework cycles) ──
    const hoaSteps = [];
    let lastHoaStepTime = 0;

    hoaReworkSteps.forEach((reworkStep, idx) => {
        const reworkTime = reworkStep.timestamp ? new Date(reworkStep.timestamp).getTime() : 0;

        // Submissions for this cycle (strictly before this rework, and >= last rework)
        const cycleSubmits = hoaSubmitSteps.filter(s => {
            const t = s.timestamp ? new Date(s.timestamp).getTime() : 0;
            return t <= reworkTime && (lastHoaStepTime === 0 || t >= lastHoaStepTime);
        });
        const userSubmit = cycleSubmits[cycleSubmits.length - 1];

        const cycleAudit = auditHoaSubmitLogs.filter(a => {
            const t = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            return t <= reworkTime && (lastHoaStepTime === 0 || t >= lastHoaStepTime);
        }).pop();

        const hoaActorRaw = (userSubmit?.user && !isApproverName(userSubmit.user) ? userSubmit.user : null) ||
                            (cycleAudit?.user && !isApproverName(cycleAudit.user) ? cycleAudit.user : null) ||
                            defaultHoaUser;
        const hoaActor = getHoaUserDisplayName(hoaActorRaw);
        const hoaTime = userSubmit?.timestamp || cycleAudit?.timestamp || (idx > 0 && hoaReworkSteps[idx - 1] ? hoaReworkSteps[idx - 1].timestamp : (initialProcessedStep?.timestamp || activeInvoiceData?.uploaded_at || activeInvoiceData?.processed_at));

        // HOA User step for this rework cycle
        hoaSteps.push({
            title: "HOA User",
            status: "completed",
            subtitle: hoaActor,
            time: formatStepTime(hoaTime),
            comment: userSubmit?.comment
        });

        // HOA Approver step that triggered rework
        hoaSteps.push({
            title: "HOA Approver",
            status: "reworked",
            subtitle: reworkStep.user ? `${getUserDisplayName(reworkStep.user)} (Sent for Rework)` : "Janani (Sent for Rework)",
            time: formatStepTime(reworkStep.timestamp),
            comment: reworkStep.comment
        });

        lastHoaStepTime = reworkTime;
    });

    // Current/Active HOA Cycle (after all prior rework cycles)
    // Only submissions strictly AFTER the last rework step!
    const currentHoaSubmits = hoaSubmitSteps.filter(s => {
        const t = s.timestamp ? new Date(s.timestamp).getTime() : 0;
        return t > lastHoaStepTime;
    });
    const latestHoaSubmit = currentHoaSubmits[currentHoaSubmits.length - 1];

    const currentAuditHoa = auditHoaSubmitLogs.filter(a => {
        const t = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        return t > lastHoaStepTime;
    }).pop();

    // Has HOA User submitted in this cycle?
    const hasHoaUserSubmitted = 
        Boolean(latestHoaSubmit) || 
        Boolean(currentAuditHoa) || 
        !["processed", "reworked"].includes(currentStatus) || 
        Boolean(hoaApproveStep);

    if (!hasHoaUserSubmitted) {
        // HOA User has not submitted in this cycle yet -> In Queue!
        hoaSteps.push({
            title: "HOA User",
            status: "queued",
            subtitle: "In Queue",
            time: null,
            comment: null
        });

        hoaSteps.push({
            title: "HOA Approver",
            status: "queued",
            subtitle: "In Queue",
            time: null,
            comment: null
        });
    } else {
        // HOA User has submitted in this cycle (invoice is at waiting_hoa_approval, waiting_coding, approved, etc.)
        const hoaActorRaw = (latestHoaSubmit?.user && !isApproverName(latestHoaSubmit.user) ? latestHoaSubmit.user : null) ||
                            (currentAuditHoa?.user && !isApproverName(currentAuditHoa.user) ? currentAuditHoa.user : null) ||
                            defaultHoaUser;
        const hoaActor = getHoaUserDisplayName(hoaActorRaw);
        const hoaTime = latestHoaSubmit?.timestamp || currentAuditHoa?.timestamp || activeInvoiceData?.updated_at || activeInvoiceData?.uploaded_at;

        hoaSteps.push({
            title: "HOA User",
            status: "completed",
            subtitle: hoaActor,
            time: formatStepTime(hoaTime),
            comment: latestHoaSubmit?.comment
        });

        // Current HOA Approver state
        if (currentStatus === "waiting_hoa_approval") {
            hoaSteps.push({
                title: "HOA Approver",
                status: "waiting",
                subtitle: "Waiting",
                time: null,
                comment: null
            });
        } else if (hoaRejectStep && (!hoaApproveStep || new Date(hoaRejectStep.timestamp).getTime() > hoaApproveTime)) {
            hoaSteps.push({
                title: "HOA Approver",
                status: "rejected",
                subtitle: getUserDisplayName(hoaRejectStep.user || "Janani"),
                time: formatStepTime(hoaRejectStep.timestamp),
                comment: hoaRejectStep.comment
            });
        } else if (hoaApproveStep) {
            hoaSteps.push({
                title: "HOA Approver",
                status: "completed",
                subtitle: getUserDisplayName(hoaApproveStep.user || "Janani"),
                time: formatStepTime(hoaApproveStep.timestamp),
                comment: hoaApproveStep.comment
            });
        } else {
            hoaSteps.push({
                title: "HOA Approver",
                status: "queued",
                subtitle: "In Queue",
                time: null,
                comment: null
            });
        }
    }

    // ── AP Stage Identification ──
    // The AP Stage can ONLY be reached if the final HOA Approver step is COMPLETED (Approved)
    const finalHoaApprover = hoaSteps.filter(s => s.title === "HOA Approver").slice(-1)[0];
    const isHoaStageFullyApproved = finalHoaApprover?.status === "completed";

    const apSteps = [];

    if (!isHoaStageFullyApproved) {
        apSteps.push({
            title: "AP User",
            status: "queued",
            subtitle: "In Queue",
            time: null,
            comment: null
        });
        apSteps.push({
            title: "AP Approver",
            status: "queued",
            subtitle: "In Queue",
            time: null,
            comment: null
        });
    } else {
        const apReworkSteps = historySteps.filter(s => {
            const type = (s.step_type || "").toLowerCase();
            const name = (s.step_name || "").toLowerCase();
            const comment = (s.comment || "").toLowerCase();
            if (type !== "reworked") return false;
            if (name.includes("hoa") || comment.includes("hoa")) return false;
            const t = s.timestamp ? new Date(s.timestamp).getTime() : 0;
            return t >= hoaApproveTime;
        });

        const isApCodeStep = (s) => {
            const type = (s.step_type || "").toLowerCase();
            const name = (s.step_name || "").toLowerCase();
            if (type === "reworked" || name.includes("rework")) return false;
            if (type === "rejected" || name.includes("reject")) return false;
            if (["approved", "posted", "sage_posted"].includes(type) || name.includes("approv")) return false;
            return type === "coding" || 
                   type === "ap_coded" || 
                   name.includes("ap user coded") || 
                   name.includes("coding") || 
                   name.includes("ap submit") ||
                   (name.includes("ap user") && !name.includes("rework"));
        };

        const apCodingSteps = historySteps.filter(isApCodeStep);

        const apApproveStep = [...historySteps].reverse().find(s => {
            const type = (s.step_type || "").toLowerCase();
            const name = (s.step_name || "").toLowerCase();
            return ["approved", "posted", "sage_posted"].includes(type) ||
                   name.includes("ap approv") ||
                   name.includes("posted");
        });

        const apRejectStep = [...historySteps].reverse().find(s => {
            const type = (s.step_type || "").toLowerCase();
            const name = (s.step_name || "").toLowerCase();
            const comment = (s.comment || "").toLowerCase();
            if (type !== "rejected") return false;
            return !name.includes("hoa") && !comment.includes("hoa");
        });

        // Filter out true approvers and generic placeholders from AP User identification
        const isApproverNameForAp = (name) => {
            if (!name) return true;
            const n = String(name).toLowerCase().trim();
            if (n.includes("janani") || n.includes("pricilla") || n.includes("jagadhish") || n.includes("approv")) return true;
            if (n.includes("system") || n.includes("admin") || n.includes("ap coder") || n.includes("ap user") || n.includes("waiting") || n === "-" || n === "in queue") return true;
            return false;
        };

        const getApUserDisplayName = (name) => {
            if (name && !isApproverNameForAp(name)) {
                const dn = getUserDisplayName(name);
                if (dn && !isApproverNameForAp(dn)) return dn;
            }
            return "Varshini";
        };

        // Identify primary AP user from actual coding steps or audit logs
        const rawFoundCoder = 
            apCodingSteps.slice().reverse().find(s => s.user && !isApproverNameForAp(s.user))?.user ||
            auditApSubmitLogs.slice().reverse().find(a => a.user && !isApproverNameForAp(a.user))?.user ||
            "Varshini";

        const defaultApUser = getApUserDisplayName(rawFoundCoder);

        let lastApStepTime = hoaApproveTime === Infinity ? 0 : hoaApproveTime;

        // Render previous AP rework cycles
        apReworkSteps.forEach((apRw, idx) => {
            const rwTime = apRw.timestamp ? new Date(apRw.timestamp).getTime() : 0;
            const cycleCodes = apCodingSteps.filter(s => {
                const t = s.timestamp ? new Date(s.timestamp).getTime() : 0;
                return t <= rwTime && (lastApStepTime === 0 || t >= lastApStepTime);
            });
            const coderStep = cycleCodes[cycleCodes.length - 1];

            const cycleAudit = auditApSubmitLogs.filter(a => {
                const t = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                return t <= rwTime && (lastApStepTime === 0 || t >= lastApStepTime);
            }).pop();

            const apUserRaw = (coderStep?.user && !isApproverNameForAp(coderStep.user) ? coderStep.user : null) ||
                              (cycleAudit?.user && !isApproverNameForAp(cycleAudit.user) ? cycleAudit.user : null) ||
                              defaultApUser;
            const apActor = getApUserDisplayName(apUserRaw);
            const apTime = coderStep?.timestamp || cycleAudit?.timestamp || (idx > 0 && apReworkSteps[idx - 1] ? apReworkSteps[idx - 1].timestamp : (lastApStepTime !== 0 && lastApStepTime !== Infinity ? lastApStepTime : apRw.timestamp));

            apSteps.push({
                title: "AP User",
                status: "completed",
                subtitle: apActor,
                time: formatStepTime(apTime),
                comment: coderStep?.comment
            });

            apSteps.push({
                title: "AP Approver",
                status: "reworked",
                subtitle: apRw.user ? `${getUserDisplayName(apRw.user)} (Sent for Rework)` : "Jagadhish (Sent for Rework)",
                time: formatStepTime(apRw.timestamp),
                comment: apRw.comment
            });

            lastApStepTime = rwTime;
        });

        // Current / Active AP cycle
        const currentApCodes = apCodingSteps.filter(s => {
            const t = s.timestamp ? new Date(s.timestamp).getTime() : 0;
            return t > lastApStepTime;
        });
        const latestApCode = currentApCodes[currentApCodes.length - 1];

        const currentApAudits = auditApSubmitLogs.filter(a => {
            const t = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            return t > lastApStepTime;
        });
        const latestApAudit = currentApAudits[currentApAudits.length - 1];

        // Has AP User submitted in this cycle?
        // While at waiting_coding (or reworked before AP user submits), AP User has not submitted yet -> In Queue!
        const hasApUserSubmitted = 
            Boolean(latestApCode) || 
            Boolean(latestApAudit) || 
            ["waiting_ap_approval", "waiting_approval", "approved", "sage_posted", "sage_post_failed"].includes(currentStatus) || 
            (currentStatus === "rejected" && !!apRejectStep);

        if (!hasApUserSubmitted) {
            // AP User has not coded/submitted yet -> AP User is In Queue
            apSteps.push({
                title: "AP User",
                status: "queued",
                subtitle: "In Queue",
                time: null,
                comment: null
            });
            apSteps.push({
                title: "AP Approver",
                status: "queued",
                subtitle: "In Queue",
                time: null,
                comment: null
            });
        } else {
            // AP User has coded and submitted to AP Approver (invoice is at waiting_ap_approval, waiting_approval, approved, etc.)
            const apUserRaw = (latestApCode?.user && !isApproverNameForAp(latestApCode.user) ? latestApCode.user : null) ||
                              (latestApAudit?.user && !isApproverNameForAp(latestApAudit.user) ? latestApAudit.user : null) ||
                              defaultApUser;
            const apActor = getApUserDisplayName(apUserRaw);
            const apTime = latestApCode?.timestamp || latestApAudit?.timestamp || activeInvoiceData?.updated_at;

            apSteps.push({
                title: "AP User",
                status: "completed",
                subtitle: apActor,
                time: formatStepTime(apTime),
                comment: latestApCode?.comment
            });

            // AP Approver
            if (["waiting_ap_approval", "waiting_approval"].includes(currentStatus)) {
                apSteps.push({
                    title: "AP Approver",
                    status: "waiting",
                    subtitle: "Waiting",
                    time: null,
                    comment: null
                });
            } else if (currentStatus === "rejected" && apRejectStep) {
                apSteps.push({
                    title: "AP Approver",
                    status: "rejected",
                    subtitle: getUserDisplayName(apRejectStep.user || "Jagadhish"),
                    time: formatStepTime(apRejectStep.timestamp),
                    comment: apRejectStep.comment
                });
            } else if (currentStatus === "sage_post_failed") {
                apSteps.push({
                    title: "AP Approver",
                    status: "waiting",
                    subtitle: "Sage Post Failed - Waiting for repost",
                    time: formatStepTime(apApproveStep?.timestamp),
                    comment: apApproveStep?.comment
                });
            } else if (["approved", "sage_posted"].includes(currentStatus)) {
                apSteps.push({
                    title: "AP Approver",
                    status: "completed",
                    subtitle: getUserDisplayName(apApproveStep?.user || (currentStatus === "sage_posted" ? "Approved & Posted to Sage" : "Jagadhish")),
                    time: formatStepTime(apApproveStep?.timestamp),
                    comment: apApproveStep?.comment
                });
            } else {
                apSteps.push({
                    title: "AP Approver",
                    status: "queued",
                    subtitle: "In Queue",
                    time: null,
                    comment: null
                });
            }
        }
    }

    const steps = [
        step1,
        ...hoaSteps,
        ...apSteps
    ];

    return (
        <div className="bg-white p-10 font-sans relative">
            <div className="mb-6 pb-4 border-b border-gray-100 text-left">
                <h4 className="text-[14px] font-bold text-gray-800 m-0">Approval Sequence</h4>
                <p className="text-[11px] text-gray-500 m-0 mt-0.5">Sequential stages and completion status</p>
            </div>

            <div className="flex flex-col gap-0">
                {steps.map((item, index) => {
                    const config = getStatusConfig(item.status);
                    const isLast = index === steps.length - 1;

                    return (
                        <div key={index} className="flex gap-6 relative items-stretch">
                            <div className="flex flex-col items-center">
                                <div className="z-10 bg-white py-1">
                                    {config.icon}
                                </div>
                                {!isLast && (
                                    <div
                                        className={`w-[2px] flex-1 ${config.lineStyle === 'dashed' ? 'border-l-2 border-dashed border-gray-200' : config.lineColor}`}
                                        style={{ minHeight: "22px" }}
                                    />
                                )}
                            </div>

                            <div className="pb-5 pt-1 flex-1 flex flex-col justify-start text-left">
                                <div className={`text-[13px] font-normal tracking-wide ${config.titleColor}`}>
                                    {item.title}
                                </div>

                                <div className="mt-1 flex flex-col gap-1">
                                    <div className="flex items-baseline gap-3">
                                        <span className={`text-[12px] font-normal ${config.subtitleColor}`}>
                                            {item.subtitle || config.defaultSubtitle}
                                        </span>
                                        {item.time && (
                                            <span className={`text-[12px] font-normal ${config.timeColor}`}>
                                                {item.time}
                                            </span>
                                        )}
                                    </div>
                                    {item.comment && (
                                        <div className={`mt-1 text-[11px] italic text-gray-500 bg-gray-50 p-2 rounded border-l-2 ${item.status === 'rejected' ? 'border-[#ED5565]' : (item.status === 'reworked' ? 'border-[#F8AC59]' : 'border-[#1AB394]')} max-w-md shadow-sm`}>
                                            "{item.comment}"
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WorkflowTab;

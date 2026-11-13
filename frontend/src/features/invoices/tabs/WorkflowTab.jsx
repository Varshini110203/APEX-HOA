import React, { useMemo } from "react";
import { 
    CheckOutlined, 
    ClockCircleOutlined, 
    CloseOutlined, 
    RollbackOutlined 
} from "@ant-design/icons";
import { useInvoiceStore } from "../../../store/invoice.store";
import { useWorkflowDataSync } from "../../hooks/useWorkflow";
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
    const isArchived = activeInvoiceData?.is_archived;

    const {
        workflowData: liveWorkflowData,
        isLoadingWorkflowData,
    } = useWorkflowDataSync(!isArchived ? viewInvoiceId : null, {});

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

    const currentStatus = (activeInvoiceData?.status || "processed").toLowerCase();

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

    // Find recorded steps in chronological history
    const processedStep = historySteps.find(s => 
        (s.step_type && s.step_type.toLowerCase() === "processed") || 
        (s.step_name && s.step_name.toLowerCase().includes("process"))
    );

    const hoaUserStep = historySteps.find(s => 
        (s.step_name && s.step_name.toLowerCase().includes("hoa user")) ||
        (s.step_name && s.step_name.toLowerCase().includes("hoa submit"))
    );

    const hoaApproveStep = historySteps.find(s => 
        (s.step_type && s.step_type.toLowerCase() === "hoa_approved") || 
        (s.step_name && s.step_name.toLowerCase().includes("hoa approv"))
    );

    const apCodedStep = [...historySteps].reverse().find(s => 
        (s.step_type && s.step_type.toLowerCase() === "coding") ||
        (s.step_type && s.step_type.toLowerCase() === "ap_coded") ||
        (s.step_name && s.step_name.toLowerCase().includes("ap user")) ||
        (s.step_name && s.step_name.toLowerCase().includes("coding"))
    );

    const apApproveStep = [...historySteps].reverse().find(s => 
        (s.step_type && ["approved", "posted", "sage_posted"].includes(s.step_type.toLowerCase())) ||
        (s.step_name && s.step_name.toLowerCase().includes("ap approv")) ||
        (s.step_name && s.step_name.toLowerCase().includes("posted"))
    );

    const reworkStep = [...historySteps].reverse().find(s => 
        s.step_type && s.step_type.toLowerCase() === "reworked"
    );

    const rejectStep = [...historySteps].reverse().find(s => 
        s.step_type && s.step_type.toLowerCase() === "rejected"
    );

    const isHoaStageRework = reworkStep && (
        !hoaApproveStep || 
        (reworkStep.step_name && reworkStep.step_name.toLowerCase().includes("hoa")) ||
        (reworkStep.comment && reworkStep.comment.toLowerCase().includes("hoa"))
    );

    const isHoaStageReject = rejectStep && (
        !hoaApproveStep || 
        (rejectStep.step_name && rejectStep.step_name.toLowerCase().includes("hoa")) ||
        (rejectStep.comment && rejectStep.comment.toLowerCase().includes("hoa"))
    );

    // ── 1. Processed ──
    const processedActor = processedStep?.user || activeInvoiceData?.uploaded_by || "System";
    const step1 = {
        title: "Processed",
        status: "completed",
        subtitle: getUserDisplayName(processedActor),
        time: formatIST(processedStep?.timestamp || activeInvoiceData?.uploaded_at || activeInvoiceData?.processed_at),
        comment: processedStep?.comment
    };

    // ── 2. HOA User ──
    let step2Status = "queued";
    let step2Subtitle = "Waiting";
    let step2Time = null;
    let step2Comment = null;

    if (currentStatus === "processed") {
        step2Status = "waiting";
        step2Subtitle = "Waiting";
    } else if (currentStatus === "reworked" && isHoaStageRework) {
        step2Status = "waiting";
        step2Subtitle = "Reworked - Waiting for edits";
        step2Comment = reworkStep?.comment;
    } else {
        step2Status = "completed";
        const hoaActor = hoaUserStep?.user || activeInvoiceData?.uploaded_by || "HOA User";
        step2Subtitle = getUserDisplayName(hoaActor);
        step2Time = formatIST(hoaUserStep?.timestamp || activeInvoiceData?.uploaded_at);
        step2Comment = hoaUserStep?.comment;
    }

    const step2 = {
        title: "HOA User",
        status: step2Status,
        subtitle: step2Subtitle,
        time: step2Time,
        comment: step2Comment
    };

    // ── 3. HOA Approver ──
    let step3Status = "queued";
    let step3Subtitle = "In Queue";
    let step3Time = null;
    let step3Comment = null;

    if (["uploading", "processed"].includes(currentStatus)) {
        step3Status = "queued";
        step3Subtitle = "In Queue";
    } else if (currentStatus === "waiting_hoa_approval") {
        step3Status = "waiting";
        step3Subtitle = "Waiting";
    } else if (currentStatus === "reworked" && isHoaStageRework) {
        step3Status = "reworked";
        step3Subtitle = getUserDisplayName(reworkStep?.user || "HOA Approver");
        step3Time = formatIST(reworkStep?.timestamp);
        step3Comment = reworkStep?.comment;
    } else if (currentStatus === "rejected" && isHoaStageReject) {
        step3Status = "rejected";
        step3Subtitle = getUserDisplayName(rejectStep?.user || "HOA Approver");
        step3Time = formatIST(rejectStep?.timestamp);
        step3Comment = rejectStep?.comment;
    } else {
        step3Status = "completed";
        step3Subtitle = getUserDisplayName(hoaApproveStep?.user || "HOA Approver");
        step3Time = formatIST(hoaApproveStep?.timestamp);
        step3Comment = hoaApproveStep?.comment;
    }

    const step3 = {
        title: "HOA Approver",
        status: step3Status,
        subtitle: step3Subtitle,
        time: step3Time,
        comment: step3Comment
    };

    // ── 4. AP User ──
    let step4Status = "queued";
    let step4Subtitle = "In Queue";
    let step4Time = null;
    let step4Comment = null;

    if (["uploading", "processed", "waiting_hoa_approval"].includes(currentStatus)) {
        step4Status = "queued";
        step4Subtitle = "In Queue";
    } else if (currentStatus === "waiting_coding") {
        step4Status = "waiting";
        step4Subtitle = "Waiting";
    } else if (currentStatus === "reworked" && !isHoaStageRework) {
        step4Status = "waiting";
        step4Subtitle = "Reworked - Waiting for codification";
        step4Comment = reworkStep?.comment;
    } else {
        step4Status = "completed";
        const apActor = apCodedStep?.user || activeInvoiceData?.last_modified_by || "AP Coder";
        step4Subtitle = getUserDisplayName(apActor);
        step4Time = formatIST(apCodedStep?.timestamp || activeInvoiceData?.updated_at);
        step4Comment = apCodedStep?.comment;
    }

    const step4 = {
        title: "AP User",
        status: step4Status,
        subtitle: step4Subtitle,
        time: step4Time,
        comment: step4Comment
    };

    // ── 5. AP Approver ──
    let step5Status = "queued";
    let step5Subtitle = "In Queue";
    let step5Time = null;
    let step5Comment = null;

    if (["uploading", "processed", "waiting_hoa_approval", "waiting_coding"].includes(currentStatus)) {
        step5Status = "queued";
        step5Subtitle = "In Queue";
    } else if (["waiting_ap_approval", "waiting_approval"].includes(currentStatus)) {
        step5Status = "waiting";
        step5Subtitle = "Waiting";
    } else if (currentStatus === "reworked" && !isHoaStageRework) {
        step5Status = "reworked";
        step5Subtitle = getUserDisplayName(reworkStep?.user || "AP Approver");
        step5Time = formatIST(reworkStep?.timestamp);
        step5Comment = reworkStep?.comment;
    } else if (currentStatus === "rejected" && !isHoaStageReject) {
        step5Status = "rejected";
        step5Subtitle = getUserDisplayName(rejectStep?.user || "AP Approver");
        step5Time = formatIST(rejectStep?.timestamp);
        step5Comment = rejectStep?.comment;
    } else if (currentStatus === "sage_post_failed") {
        step5Status = "waiting";
        step5Subtitle = "Sage Post Failed - Waiting for repost";
        step5Time = formatIST(apApproveStep?.timestamp);
        step5Comment = apApproveStep?.comment;
    } else if (["approved", "sage_posted"].includes(currentStatus)) {
        step5Status = "completed";
        step5Subtitle = getUserDisplayName(apApproveStep?.user || (currentStatus === "sage_posted" ? "Approved & Posted to Sage" : "AP Approver"));
        step5Time = formatIST(apApproveStep?.timestamp);
        step5Comment = apApproveStep?.comment;
    }

    const step5 = {
        title: "AP Approver",
        status: step5Status,
        subtitle: step5Subtitle,
        time: step5Time,
        comment: step5Comment
    };

    const steps = [step1, step2, step3, step4, step5];

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

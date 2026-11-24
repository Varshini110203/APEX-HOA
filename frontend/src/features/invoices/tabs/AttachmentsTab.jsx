import React, { useState, useEffect, useMemo, useRef } from "react";
import { Modal, Table, Space, message, Spin } from "antd";
import { Trash2, Download, Paperclip, FileText, Image, FileSpreadsheet, Eye, ExternalLink, X, AlertCircle } from "lucide-react";
import { useInvoiceStore } from "../../../store/invoice.store";
import { useAuthStore } from "../../../store/authStore";
import {
    uploadInvoiceAttachments,
    deleteInvoiceAttachment,
    getInvoiceAttachmentLink,
    getInvoiceAttachmentFile,
    getInvoiceById
} from "../../../api/invoiceApi";
import CustomButton from "../../../shared/components/CustomButton";
import AddAttachmentModal from "../components/AddAttachmentModal";

const formatSize = (bytes) => {
    if (bytes === undefined || bytes === null) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
        const d = new Date(dateStr);
        return d.toLocaleString();
    } catch {
        return dateStr;
    }
};

const AttachmentsTab = () => {
    const { activeInvoiceData, setActiveInvoiceData, viewInvoiceId, isEditingEnabled: storeEditingEnabled } = useInvoiceStore();
    const { user, activeRole } = useAuthStore();
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [loading, setLoading] = useState(false);

    // Attachment Preview Modal State
    const [previewAttachment, setPreviewAttachment] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState(null);

    const roleClean = (activeRole || user?.role || "").toLowerCase().trim();
    const isHoaRole = roleClean.includes("hoa");
    const isApRole = (roleClean.split(/\s+/).includes("ap") || roleClean.includes("coder")) && !isHoaRole;
    const isApproverRole = roleClean.includes("approver");

    const isAdmin = roleClean === "admin";
    const isHoaApprover = isHoaRole && isApproverRole;
    const isHoaUser = isHoaRole && !isApproverRole;
    const isApApprover = isApRole && isApproverRole;
    const isApUser = isApRole && !isApproverRole;

    const isEditingEnabled = Boolean(
        storeEditingEnabled ||
        activeInvoiceData?.is_editing_enabled ||
        (activeInvoiceData?.editing_enabled_by &&
         activeInvoiceData?.editing_enabled_by?.toLowerCase() === user?.email?.toLowerCase())
    );

    const status = (activeInvoiceData?.status || "").toLowerCase();

    // Check if user's stage/step is active
    const isHoaUserStepActive = isHoaUser && (status === "processed" || status === "reworked");
    const isApUserStepActive = isApUser && (status === "waiting_coding" || status === "sage_posted");
    const isHoaApproverStepActive = isHoaApprover && status === "waiting_hoa_approval";
    const isApApproverStepActive = isApApprover && ["waiting_ap_approval", "waiting_approval", "sage_post_failed"].includes(status);

    const showAddButton = useMemo(() => {
        if (activeInvoiceData?.is_archived) return false;
        if (["deleted"].includes(status)) return false;

        // Admin can always see the button
        if (isAdmin) return true;

        // If HOA User's step is over, do not show the button
        if (isHoaUser) {
            return isHoaUserStepActive;
        }

        // If AP User's step is over, do not show the button
        if (isApUser) {
            return isApUserStepActive;
        }

        // For HOA Approver: show only during their step
        if (isHoaApprover) {
            return isHoaApproverStepActive;
        }

        // For AP Approver: show only during their step
        if (isApApprover) {
            return isApApproverStepActive;
        }

        // Generic approver role
        if (isApproverRole) {
            return isEditingEnabled;
        }

        // Generic user role (scanner, coder, ar user)
        if (roleClean.includes("user") || roleClean === "scanner" || roleClean === "coder") {
            return status === "processed" || status === "waiting_coding";
        }

        return false;
    }, [
        activeInvoiceData?.is_archived,
        status,
        isAdmin,
        isHoaUser,
        isHoaUserStepActive,
        isApUser,
        isApUserStepActive,
        isHoaApprover,
        isHoaApproverStepActive,
        isApApprover,
        isApApproverStepActive,
        isApproverRole,
        isEditingEnabled,
        roleClean,
    ]);

    const canAddAttachment = useMemo(() => {
        if (!showAddButton) return false;

        // Admin can always add attachments
        if (isAdmin) return true;

        // HOA Approver and AP Approver:
        // Enabled ONLY if they click the "Enable Editing" button
        if (isHoaApprover || isApApprover || isApproverRole) {
            return isEditingEnabled;
        }

        // HOA User and AP User (when their step is active):
        // Enabled
        if (isHoaUserStepActive || isApUserStepActive) {
            return true;
        }

        // Other active user roles
        if (roleClean.includes("user") || roleClean === "scanner" || roleClean === "coder") {
            return true;
        }

        return false;
    }, [
        showAddButton,
        isAdmin,
        isHoaApprover,
        isApApprover,
        isApproverRole,
        isEditingEnabled,
        isHoaUserStepActive,
        isApUserStepActive,
        roleClean,
    ]);

    const canModify = canAddAttachment;

    const rawAttachments = activeInvoiceData?.attachments;
    const attachments = useMemo(() => {
        if (!rawAttachments) return [];
        if (Array.isArray(rawAttachments)) return rawAttachments;
        if (typeof rawAttachments === "string") {
            try {
                const parsed = JSON.parse(rawAttachments);
                return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
            } catch {
                return [];
            }
        }
        if (typeof rawAttachments === "object" && rawAttachments !== null) {
            return [rawAttachments];
        }
        return [];
    }, [rawAttachments]);

    useEffect(() => {
        const loadFreshData = async () => {
            if (viewInvoiceId) {
                try {
                    setLoading(true);
                    const updated = await getInvoiceById(viewInvoiceId);
                    const currentData = useInvoiceStore.getState().activeInvoiceData;
                    setActiveInvoiceData({
                        ...updated,
                        is_editing_enabled: currentData?.is_editing_enabled ?? updated?.is_editing_enabled,
                        editing_enabled_by: currentData?.editing_enabled_by ?? updated?.editing_enabled_by,
                    });
                } catch (err) {
                    console.error("Failed to load invoice attachments:", err);
                } finally {
                    setLoading(false);
                }
            }
        };
        loadFreshData();
    }, [viewInvoiceId, setActiveInvoiceData]);

    const handleView = async (attachment) => {
        if (!attachment) return;

        // Clean up any existing blob URL
        if (previewUrl && previewUrl.startsWith("blob:")) {
            URL.revokeObjectURL(previewUrl);
        }

        setPreviewAttachment(attachment);
        setPreviewError(null);
        setPreviewUrl(null);

        const filename = attachment.filename || "";
        const lower = filename.toLowerCase();
        const isSpreadsheet = lower.endsWith(".xls") || lower.endsWith(".xlsx") || lower.endsWith(".csv");

        if (isSpreadsheet) {
            setPreviewLoading(false);
            return;
        }

        setPreviewLoading(true);
        try {
            let loadedUrl = null;

            // 1. First priority: Fetch blob directly from backend to avoid any cross-origin/iframe limitations
            try {
                const blob = await getInvoiceAttachmentFile(viewInvoiceId, attachment.blob_name);
                if (blob && blob.size > 0) {
                    loadedUrl = URL.createObjectURL(blob);
                }
            } catch (blobErr) {
                console.warn("Direct attachment file fetch failed, falling back to SAS link:", blobErr);
            }

            // 2. Second priority: Fallback to Azure SAS URL
            if (!loadedUrl) {
                const linkRes = await getInvoiceAttachmentLink(viewInvoiceId, attachment.blob_name);
                if (linkRes?.sas_url) {
                    loadedUrl = linkRes.sas_url;
                }
            }

            if (loadedUrl) {
                setPreviewUrl(loadedUrl);
            } else {
                setPreviewError("Unable to load preview for this attachment.");
            }
        } catch (err) {
            console.error("Error previewing attachment:", err);
            setPreviewError("Failed to load attachment preview.");
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleClosePreview = () => {
        if (previewUrl && previewUrl.startsWith("blob:")) {
            URL.revokeObjectURL(previewUrl);
        }
        setPreviewAttachment(null);
        setPreviewUrl(null);
        setPreviewError(null);
        setPreviewLoading(false);
    };

    const handleDownload = async (attachment) => {
        const hideLoading = message.loading("Preparing attachment download...", 0);
        try {
            // Priority 1: Direct blob download
            try {
                const blob = await getInvoiceAttachmentFile(viewInvoiceId, attachment.blob_name);
                if (blob && blob.size > 0) {
                    hideLoading();
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = attachment.filename || "attachment";
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    message.success("Download started.");
                    return;
                }
            } catch (err) {
                console.warn("Direct blob download failed, falling back to link:", err);
            }

            // Priority 2: SAS URL fallback
            const res = await getInvoiceAttachmentLink(viewInvoiceId, attachment.blob_name);
            hideLoading();
            if (res.sas_url) {
                window.open(res.sas_url, "_blank");
            } else {
                message.error("Failed to generate download link.");
            }
        } catch (err) {
            hideLoading();
            console.error("Error downloading attachment:", err);
            message.error("Failed to download attachment.");
        }
    };

    const handleDelete = (attachment) => {
        setItemToDelete(attachment);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            setLoading(true);
            await deleteInvoiceAttachment(viewInvoiceId, itemToDelete.blob_name);
            message.success("Attachment deleted successfully.");
            setItemToDelete(null);
            // Reload invoice data
            const updated = await getInvoiceById(viewInvoiceId);
            const currentData = useInvoiceStore.getState().activeInvoiceData;
            setActiveInvoiceData({
                ...updated,
                is_editing_enabled: currentData?.is_editing_enabled ?? updated?.is_editing_enabled,
                editing_enabled_by: currentData?.editing_enabled_by ?? updated?.editing_enabled_by,
            });
        } catch (err) {
            console.error("Error deleting attachment:", err);
            message.error(err.response?.data?.detail || "Failed to delete attachment.");
        } finally {
            setLoading(false);
        }
    };

    const handleUploadSuccess = async () => {
        try {
            const updated = await getInvoiceById(viewInvoiceId);
            const currentData = useInvoiceStore.getState().activeInvoiceData;
            setActiveInvoiceData({
                ...updated,
                is_editing_enabled: currentData?.is_editing_enabled ?? updated?.is_editing_enabled,
                editing_enabled_by: currentData?.editing_enabled_by ?? updated?.editing_enabled_by,
            });
        } catch (err) {
            console.error("Failed to reload invoice details after upload:", err);
        }
    };

    const columns = [
        {
            title: "File Name",
            dataIndex: "filename",
            key: "filename",
            render: (text, record) => {
                const name = record.filename || record.name || text || "Attachment";
                const lower = name.toLowerCase();
                const isPdf = lower.endsWith(".pdf");
                const isExcel = lower.endsWith(".xls") || lower.endsWith(".xlsx") || lower.endsWith(".csv");
                return (
                    <div
                        className="flex items-center gap-2 group cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleView(record);
                        }}
                        title={`Click to view ${name}`}
                    >
                        {isPdf ? (
                            <FileText size={16} className="text-[#22B4E6] flex-shrink-0" />
                        ) : isExcel ? (
                            <FileSpreadsheet size={16} className="text-emerald-500 flex-shrink-0" />
                        ) : (
                            <Image size={16} className="text-[#22B4E6] flex-shrink-0" />
                        )}
                        <span className="font-medium text-gray-800 group-hover:text-[#22B4E6] group-hover:underline transition-colors truncate">
                            {name}
                        </span>
                    </div>
                );
            }
        },
        {
            title: "Size",
            dataIndex: "size",
            key: "size",
            render: (size, record) => formatSize(size ?? record?.file_size)
        },
        {
            title: "Uploaded By",
            dataIndex: "uploaded_by",
            key: "uploaded_by",
            render: (val) => val || "-"
        },
        {
            title: "Uploaded At",
            dataIndex: "uploaded_at",
            key: "uploaded_at",
            render: (val) => formatDate(val)
        },
        {
            title: "Actions",
            key: "actions",
            render: (_, record) => (
                <Space size="small">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleView(record);
                        }}
                        className="text-[#22B4E6] hover:text-[#198cb4] flex items-center justify-center p-1.5 rounded-md hover:bg-sky-50 transition-colors cursor-pointer bg-transparent border-0"
                        title="View Attachment"
                    >
                        <Eye size={16} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(record);
                        }}
                        className="text-gray-500 hover:text-gray-700 flex items-center justify-center p-1.5 rounded-md hover:bg-gray-100 transition-colors cursor-pointer bg-transparent border-0"
                        title="Download Attachment"
                    >
                        <Download size={16} />
                    </button>
                    {canModify && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(record);
                            }}
                            className="text-[#F87171] hover:text-red-600 flex items-center justify-center p-1.5 rounded-md hover:bg-red-50 transition-colors cursor-pointer bg-transparent border-0"
                            title="Delete"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                </Space>
            )
        }
    ];

    return (
        <div className="p-4 h-full flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                    <Paperclip size={18} className="text-[#11699E]" />
                    <span className="text-[16px] font-semibold text-gray-800 custom-font-jura">
                        Attachments ({attachments.length})
                    </span>
                </div>
                {showAddButton && (
                    <button
                        onClick={() => {
                            if (canAddAttachment) setIsUploadModalOpen(true);
                        }}
                        disabled={!canAddAttachment}
                        className={`px-4 h-9 flex items-center justify-center text-[13px] font-semibold rounded-lg transition-all border-0 ${
                            canAddAttachment
                                ? "text-white bg-[#22B4E6] hover:opacity-90 cursor-pointer shadow-sm"
                                : "text-gray-400 bg-gray-200 cursor-not-allowed opacity-60"
                        }`}
                        title={
                            !canAddAttachment && (isHoaApprover || isApApprover || isApproverRole)
                                ? "Click 'Enable Editing' in the top bar to add attachments"
                                : !canAddAttachment
                                ? "You do not have permission to add attachments"
                                : "Add Attachment"
                        }
                    >
                        Add Attachment
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-auto bg-white rounded-xl border border-gray-100 shadow-sm">
                <Table
                    columns={columns}
                    dataSource={attachments.map((att, idx) => ({ ...att, key: att.blob_name || att.filename || att.name || idx }))}
                    pagination={false}
                    onRow={(record) => ({
                        onClick: (e) => {
                            if (e.target.closest("button") || e.target.closest("a")) return;
                            handleView(record);
                        },
                        className: "cursor-pointer hover:bg-sky-50/40 transition-colors"
                    })}
                    locale={{
                        emptyText: (
                            <div className="py-12 text-center text-gray-400 flex flex-col items-center gap-2">
                                <Paperclip size={32} strokeWidth={1} />
                                <span>No attachments found</span>
                                {showAddButton && canAddAttachment ? (
                                    <span className="text-xs text-gray-400">
                                        Click "Add Attachment" to upload pdf, jpg, jpeg, png, xls, xlsx, csv files
                                    </span>
                                ) : showAddButton && !canAddAttachment && (isHoaApprover || isApApprover || isApproverRole) ? (
                                    <span className="text-xs text-gray-400">
                                        Click "Enable Editing" in the top bar to upload attachments
                                    </span>
                                ) : null}
                            </div>
                        )
                    }}
                />
            </div>

            {/* Attachment Preview Modal */}
            <Modal
                open={!!previewAttachment}
                onCancel={handleClosePreview}
                footer={null}
                title={null}
                width={960}
                centered
                destroyOnClose
                closeIcon={null}
                styles={{
                    content: {
                        padding: 0,
                        borderRadius: "16px",
                        overflow: "hidden",
                        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)"
                    },
                    body: {
                        padding: 0
                    }
                }}
            >
                {previewAttachment && (
                    <div className="flex flex-col h-[82vh] max-h-[850px] bg-white">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-100 bg-gray-50/80">
                            <div className="flex items-center gap-3 min-w-0 pr-4">
                                <div className="p-2 rounded-lg bg-sky-50 text-[#11699E] flex-shrink-0">
                                    {(() => {
                                        const lower = (previewAttachment.filename || "").toLowerCase();
                                        if (lower.endsWith(".pdf")) return <FileText size={20} className="text-[#22B4E6]" />;
                                        if (lower.endsWith(".xls") || lower.endsWith(".xlsx") || lower.endsWith(".csv")) return <FileSpreadsheet size={20} className="text-emerald-500" />;
                                        return <Image size={20} className="text-[#11699E]" />;
                                    })()}
                                </div>
                                <div className="min-w-0">
                                    <div className="font-semibold text-gray-800 text-[15px] truncate custom-font-jura" title={previewAttachment.filename}>
                                        {previewAttachment.filename}
                                    </div>
                                    <div className="text-xs text-gray-500 flex items-center gap-2">
                                        <span>{formatSize(previewAttachment.size)}</span>
                                        {previewAttachment.uploaded_at && (
                                            <>
                                                <span>•</span>
                                                <span>Uploaded {formatDate(previewAttachment.uploaded_at)}</span>
                                            </>
                                        )}
                                        {previewAttachment.uploaded_by && (
                                            <>
                                                <span>•</span>
                                                <span>by {previewAttachment.uploaded_by}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                                {previewUrl && (
                                    <button
                                        onClick={() => window.open(previewUrl, "_blank")}
                                        className="h-8 px-2.5 flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors cursor-pointer"
                                        title="Open in new window"
                                    >
                                        <ExternalLink size={14} />
                                        <span className="hidden sm:inline">Open in Tab</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDownload(previewAttachment)}
                                    className="h-8 px-2.5 flex items-center gap-1.5 text-xs font-medium text-[#11699E] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors cursor-pointer"
                                    title="Download attachment"
                                >
                                    <Download size={14} />
                                    <span className="hidden sm:inline">Download</span>
                                </button>
                                <button
                                    onClick={handleClosePreview}
                                    className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer border-0 bg-transparent ml-1"
                                    title="Close"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Viewer Body */}
                        <div className="flex-1 min-h-0 bg-gray-100/60 flex items-center justify-center overflow-auto p-4">
                            {previewLoading ? (
                                <div className="flex flex-col items-center gap-3 py-12">
                                    <Spin size="large" />
                                    <span className="text-sm text-gray-500 font-medium">Loading attachment preview...</span>
                                </div>
                            ) : previewError ? (
                                <div className="flex flex-col items-center gap-3 p-8 bg-white rounded-xl border border-red-100 shadow-sm max-w-md text-center">
                                    <AlertCircle size={40} className="text-red-500" />
                                    <div className="text-base font-semibold text-gray-800">Preview Unavailable</div>
                                    <p className="text-xs text-gray-500">{previewError}</p>
                                    <button
                                        onClick={() => handleDownload(previewAttachment)}
                                        className="mt-2 px-4 py-2 bg-[#22B4E6] text-white rounded-lg text-xs font-semibold hover:opacity-90 flex items-center gap-2 cursor-pointer border-0"
                                    >
                                        <Download size={14} />
                                        Download File Instead
                                    </button>
                                </div>
                            ) : (() => {
                                const lower = (previewAttachment.filename || "").toLowerCase();
                                const isPdf = lower.endsWith(".pdf");
                                const isSpreadsheet = lower.endsWith(".xls") || lower.endsWith(".xlsx") || lower.endsWith(".csv");
                                const isImage = lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".gif") || lower.endsWith(".webp") || lower.endsWith(".svg");

                                if (isSpreadsheet) {
                                    return (
                                        <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-gray-200 shadow-sm max-w-md text-center">
                                            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                                                <FileSpreadsheet size={32} />
                                            </div>
                                            <h4 className="text-base font-bold text-gray-800 mb-1">{previewAttachment.filename}</h4>
                                            <p className="text-xs text-gray-500 mb-6">
                                                Spreadsheets cannot be rendered directly in the browser preview.
                                            </p>
                                            <button
                                                onClick={() => handleDownload(previewAttachment)}
                                                className="px-5 py-2.5 bg-[#22B4E6] hover:bg-[#198cb4] text-white text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer border-0 shadow-sm transition-all"
                                            >
                                                <Download size={14} />
                                                Download Spreadsheet
                                            </button>
                                        </div>
                                    );
                                }

                                if (isPdf && previewUrl) {
                                    return (
                                        <iframe
                                            src={previewUrl}
                                            title={previewAttachment.filename}
                                            className="w-full h-full rounded-lg border border-gray-200 bg-white shadow-inner"
                                        />
                                    );
                                }

                                if (isImage && previewUrl) {
                                    return (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-900/5 rounded-lg p-2 overflow-auto">
                                            <img
                                                src={previewUrl}
                                                alt={previewAttachment.filename}
                                                className="max-w-full max-h-full object-contain rounded shadow-sm select-none"
                                            />
                                        </div>
                                    );
                                }

                                return (
                                    <div className="flex flex-col items-center gap-3 p-8 bg-white rounded-xl border border-gray-200 shadow-sm max-w-md text-center">
                                        <FileText size={40} className="text-gray-400" />
                                        <div className="text-base font-semibold text-gray-800">Preview Not Supported</div>
                                        <p className="text-xs text-gray-500">This file format cannot be viewed inline.</p>
                                        <button
                                            onClick={() => handleDownload(previewAttachment)}
                                            className="mt-2 px-4 py-2 bg-[#22B4E6] text-white rounded-lg text-xs font-semibold hover:opacity-90 flex items-center gap-2 cursor-pointer border-0"
                                        >
                                            <Download size={14} />
                                            Download File
                                        </button>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </Modal>


            <Modal
                open={!!itemToDelete}
                onCancel={() => setItemToDelete(null)}
                footer={null}
                title={null}
                width={340}
                centered
                destroyOnClose
                closeIcon={null}
                styles={{
                    content: {
                        padding: 0,
                        borderRadius: "16px",
                        border: "1px solid #fee2e2",
                        overflow: "hidden"
                    },
                    body: {
                        padding: 0
                    }
                }}
            >
                <div className="flex flex-col items-center text-center bg-white" style={{ padding: "32px", boxSizing: "border-box" }}>
                    {/* Trash Icon */}
                    <div className="text-[#ef4444] bg-[#fef2f2] p-3 rounded-full mb-3 flex items-center justify-center">
                        <Trash2 size={36} />
                    </div>

                    {/* Title */}
                    <h3 className="text-[18px] font-bold text-[#111827] custom-font-jura mb-2">
                        Delete Attachment
                    </h3>

                    {/* Content */}
                    <p className="text-[13px] text-[#4b5563] custom-font-creato leading-relaxed mb-6 w-full break-all" style={{ paddingLeft: "8px", paddingRight: "8px" }}>
                        Are you sure you want to delete <strong>{itemToDelete?.filename}</strong>?
                    </p>

                    {/* Buttons */}
                    <div className="flex justify-center gap-3 w-full">
                        <button
                            onClick={() => setItemToDelete(null)}
                            disabled={loading}
                            className="flex-1 h-9 flex items-center justify-center text-[13px] font-semibold rounded-lg border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-all cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmDelete}
                            disabled={loading}
                            className="flex-1 h-9 flex items-center justify-center text-[13px] font-semibold rounded-lg text-white bg-[#ef4444] hover:bg-[#dc2626] transition-all border-0 cursor-pointer shadow-sm"
                        >
                            {loading ? "Deleting..." : "Yes, Delete"}
                        </button>
                    </div>
                </div>
            </Modal>

            <AddAttachmentModal
                open={isUploadModalOpen}
                invoiceId={viewInvoiceId}
                onCancel={() => setIsUploadModalOpen(false)}
                onSuccess={handleUploadSuccess}
            />
        </div>
    );
};

export default AttachmentsTab;

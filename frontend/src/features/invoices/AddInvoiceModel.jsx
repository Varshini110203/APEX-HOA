import React, { useState, useRef, useEffect } from "react";
import { Modal } from "antd";
import { Trash2, Hash, CheckCircle2 } from "lucide-react";
import CustomButton from "../../shared/components/CustomButton";

// ── Request ID generator ─────────────────────────────────────────────────────
// Keeps a per-session counter so IDs are unique even when generated in the
// same second.  Format: yyyymmddhhmmss + 4-digit sequence (e.g. 0001, 0002 …)
let _sessionSeq = 0;

const generateRequestId = () => {
    _sessionSeq += 1;
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, "0");
    const pad4 = (n) => String(n).padStart(4, "0");

    const yyyy = now.getFullYear();
    const MM   = pad2(now.getMonth() + 1);
    const dd   = pad2(now.getDate());
    const hh   = pad2(now.getHours());
    const mm   = pad2(now.getMinutes());
    const ss   = pad2(now.getSeconds());
    const seq  = pad4(_sessionSeq);

    return `${yyyy}${MM}${dd}${hh}${mm}${ss}${seq}`;
};
// ────────────────────────────────────────────────────────────────────────────

const AddInvoiceModal = ({
    open,
    onCancel,
    onUpload,
    confirmLoading = false,
    uploadProgress = 0,
}) => {
    const [files, setFiles]                   = useState([]);
    const [attachments, setAttachments]       = useState([]);
    const [requestId, setRequestId]           = useState(null);
    const [idCopied, setIdCopied]             = useState(false);

    // Reset state when modal is closed
    useEffect(() => {
        if (!open) {
            setFiles([]);
            setAttachments([]);
            setRequestId(null);
            setIdCopied(false);
        }
    }, [open]);

    const fileInputRef        = useRef(null);
    const attachmentInputRef  = useRef(null);

    // Handle invoice PDF files
    const handleFiles = (incoming) => {
        const allFiles = Array.from(incoming);
        const pdfs     = allFiles.filter((f) => f.type === "application/pdf");

        setFiles((prev) => {
            const existing = new Set(
                prev.map((f) => f.name + (f.webkitRelativePath || ""))
            );
            const newFiles = pdfs.filter(
                (f) => !existing.has(f.name + (f.webkitRelativePath || ""))
            );
            return [...prev, ...newFiles];
        });
    };

    // Handle other attachments (any file type, multiple)
    const handleAttachmentFiles = (incoming) => {
        const allFiles = Array.from(incoming);
        setAttachments((prev) => {
            const existing = new Set(prev.map((f) => f.name));
            const newFiles = allFiles.filter((f) => !existing.has(f.name));
            return [...prev, ...newFiles];
        });
    };

    const handleFileInput        = (e) => handleFiles(e.target.files);
    const handleAttachmentInput  = (e) => handleAttachmentFiles(e.target.files);

    const handleDeleteAttachment = (name) => {
        setAttachments((prev) => prev.filter((f) => f.name !== name));
    };

    const handleDelete = (fileToDelete) => {
        setFiles((prev) =>
            prev.filter(
                (f) =>
                    f.name !== fileToDelete.name ||
                    (f.webkitRelativePath || "") !== (fileToDelete.webkitRelativePath || "")
            )
        );
    };

    const handleUpload = () => {
        if (files.length === 0 && attachments.length === 0) return;
        onUpload?.(files, attachments, requestId);
    };

    const handleCancel = () => {
        setFiles([]);
        setAttachments([]);
        setRequestId(null);
        setIdCopied(false);
        onCancel();
    };

    const handleGenerateId = () => {
        setRequestId(generateRequestId());
        setIdCopied(false);
    };

    const handleCopyId = () => {
        if (!requestId) return;
        navigator.clipboard.writeText(requestId).then(() => {
            setIdCopied(true);
            setTimeout(() => setIdCopied(false), 2000);
        });
    };

    const formatSize = (bytes) => {
        if (bytes < 1024)             return `${bytes}B`;
        if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(0)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    };

    return (
        <Modal
            open={open}
            onCancel={handleCancel}
            footer={null}
            title={null}
            width={660}
            centered
            destroyOnClose
            maskClosable={false}
            closeIcon={null}
            styles={{
                content: { padding: 0, borderRadius: "12px", overflow: "hidden" },
                body:    { padding: 0 },
            }}
        >
            <div className="flex flex-col bg-white">

                {/* ── Header ───────────────────────────────────────────────── */}
                <div className="px-6 py-3 border-b border-[#E0E0E0] flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold text-[#2F3A4C] custom-font-jura">
                        Create New Request
                    </h2>
                    <button
                        onClick={handleCancel}
                        className="text-gray-400 hover:text-gray-600 text-lg cursor-pointer"
                    >
                        ×
                    </button>
                </div>

                {/* ── Body ─────────────────────────────────────────────────── */}
                <div className="px-6 py-5 flex flex-col gap-5">

                    {/* ── Request ID section ─────────────────────────────── */}
                    <div className="flex flex-col gap-3">
                        <p className="text-[13px] font-medium text-[#2F3A4C] custom-font-jura">
                            Request ID
                        </p>

                        <div className="flex items-center gap-3">
                            {/* Generate button */}
                            <button
                                onClick={handleGenerateId}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#22B4E6] text-[#22B4E6] text-[13px] font-medium hover:bg-[#F0FAFF] transition-colors"
                            >
                                Create New Request ID
                            </button>

                            {/* ID display badge */}
                            {requestId && (
                                <div
                                    onClick={handleCopyId}
                                    title="Click to copy"
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F0FAFF] border border-[#C5E8F5] cursor-pointer hover:border-[#22B4E6] transition-colors group"
                                >
                                    {idCopied ? (
                                        <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                                    ) : (
                                        <Hash size={10} className="text-[#22B4E6] shrink-0" />
                                    )}
                                    <span
                                        className="text-[13px] font-mono tracking-wide"
                                        style={{
                                            background: "linear-gradient(90deg, #22B4E6, #7B5EF8)",
                                            WebkitBackgroundClip: "text",
                                            WebkitTextFillColor: "transparent",
                                        }}
                                    >
                                        {requestId}
                                    </span>
                                    <span className="text-[11px] text-gray-400 group-hover:text-[#22B4E6] transition-colors">
                                        {idCopied ? "Copied!" : "Copy"}
                                    </span>
                                </div>
                            )}
                        </div>

                        {!requestId && (
                            <p className="text-[12px] text-gray-400">
                                Click <strong>Create New Request ID</strong> to generate a unique system ID for this request.
                            </p>
                        )}
                    </div>

                    {/* ── Divider ────────────────────────────────────────── */}
                    <div className="border-t border-[#F0F4F8]" />

                    {/* ── Upload section ─────────────────────────────────── */}
                    <div className="flex flex-col gap-3">
                        <p className="text-[13px] font-medium text-[#22B4E6] custom-font-jura">
                            Upload Invoice Files
                        </p>

                        <div className="flex gap-3">
                            <CustomButton
                                type="submit"
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Upload Invoice
                            </CustomButton>
                            <CustomButton
                                type="button"
                                variant="primary"
                                onClick={() => attachmentInputRef.current?.click()}
                            >
                                Upload Other Attachments
                            </CustomButton>
                        </div>

                        {/* Hidden Inputs */}
                        <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleFileInput} />
                        <input ref={attachmentInputRef} type="file" multiple className="hidden" onChange={handleAttachmentInput} />

                        {/* Invoice File List */}
                        {files.length > 0 && (
                            <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                                {files.map((file, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#E6ECF1]"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-7 h-7 rounded-md bg-[#E8F7FD] flex items-center justify-center">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                                    <path
                                                        d="M14 2H6C5 2 5 2 5 3V21C5 22 5 22 6 22H18C19 22 19 22 19 21V7L14 2Z"
                                                        stroke="#22B4E6" strokeWidth="1.5"
                                                    />
                                                </svg>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[13px] text-[#2F3A4C] truncate font-medium">
                                                    {file.webkitRelativePath || file.name}
                                                </p>
                                                <p className="text-[11px] text-gray-400">{formatSize(file.size)}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(file); }}
                                            disabled={confirmLoading}
                                            className="text-[#F87171] hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Attachment List */}
                        {attachments.length > 0 && (
                            <div className="flex flex-col gap-2 max-h-[120px] overflow-y-auto pr-1">
                                {attachments.map((file, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#E6ECF1]"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-7 h-7 rounded-md bg-[#F3F0FD] flex items-center justify-center">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                                    <path
                                                        d="M14 2H6C5 2 5 2 5 3V21C5 22 5 22 6 22H18C19 22 19 22 19 21V7L14 2Z"
                                                        stroke="#7B5EF8" strokeWidth="1.5"
                                                    />
                                                </svg>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[13px] text-[#2F3A4C] truncate font-medium">
                                                    {file.name}
                                                </p>
                                                <p className="text-[11px] text-gray-400">{formatSize(file.size)}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteAttachment(file.name); }}
                                            disabled={confirmLoading}
                                            className="text-[#F87171] hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Upload Progress ───────────────────────────────────────── */}
                {confirmLoading && (
                    <div className="px-6 pb-3">
                        <div className="w-full h-2 bg-[#E8EEF4] rounded-full overflow-hidden relative">
                            <div
                                className="h-full rounded-full transition-all duration-500 ease-out relative"
                                style={{
                                    width: `${uploadProgress}%`,
                                    background: "linear-gradient(90deg, #22B4E6 0%, #7B5EF8 55%, #E040FB 100%)",
                                    backgroundSize: "200% 100%",
                                    animation: "shimmer 2s linear infinite",
                                }}
                            >
                                <span
                                    className="absolute top-0 right-0 bottom-0 w-14 rounded-full"
                                    style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35))" }}
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                            <span className="flex items-center gap-1.5 text-xs text-gray-400">
                                <span
                                    className="w-1.5 h-1.5 rounded-full bg-[#22B4E6]"
                                    style={{ animation: uploadProgress >= 100 ? "none" : "pulse 1.2s ease-in-out infinite" }}
                                />
                                {uploadProgress >= 100 ? "Upload complete!" : "Uploading..."}
                            </span>
                            <span
                                className="text-xs font-semibold"
                                style={{
                                    background: "linear-gradient(90deg, #22B4E6, #7B5EF8)",
                                    WebkitBackgroundClip: "text",
                                    WebkitTextFillColor: "transparent",
                                }}
                            >
                                {uploadProgress}%
                            </span>
                        </div>
                    </div>
                )}

                {/* ── Footer ───────────────────────────────────────────────── */}
                <div className="flex justify-end gap-3 py-3 px-6 border-t border-[#E0E0E0]">
                    <button
                        onClick={handleCancel}
                        className="px-5 py-1.5 text-[13px] rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                        Discard
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={files.length === 0 && attachments.length === 0 || confirmLoading}
                        className="px-5 py-1.5 text-[13px] rounded-md bg-[#22B4E6] text-white hover:bg-[#1DA1D1] disabled:opacity-50"
                    >
                        {confirmLoading ? "Uploading..." : "Upload"}
                    </button>
                </div>

            </div>
        </Modal>
    );
};

export default AddInvoiceModal;
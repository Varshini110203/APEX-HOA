import React, { useState, useRef, useEffect } from "react";
import { Modal } from "antd";
import { Trash2 } from "lucide-react";
import CustomButton from "../../shared/components/CustomButton";

const AddInvoiceModal = ({
    open,
    onCancel,
    onUpload,
    confirmLoading = false,
    uploadProgress = 0,
}) => {
    const [files, setFiles]                   = useState([]);
    const [attachments, setAttachments]       = useState([]);

    // Reset state when modal opens or closes
    useEffect(() => {
        if (!open) {
            setFiles([]);
            setAttachments([]);
        }
    }, [open]);

    const fileInputRef        = useRef(null);
    const attachmentInputRef  = useRef(null);

    // Handle invoice PDF file (only one invoice allowed)
    const handleFiles = (incoming) => {
        const allFiles = Array.from(incoming);
        const pdfs     = allFiles.filter(
            (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
        );

        if (pdfs.length > 0) {
            setFiles([pdfs[0]]);
        }
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

    const handleFileInput = (e) => {
        handleFiles(e.target.files);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleAttachmentInput = (e) => {
        handleAttachmentFiles(e.target.files);
        if (attachmentInputRef.current) {
            attachmentInputRef.current.value = "";
        }
    };

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
        onUpload?.(files, attachments);
    };

    const handleCancel = () => {
        setFiles([]);
        setAttachments([]);
        onCancel();
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

                    {/* ── Upload Invoice section ─────────────────────────── */}
                    <div className="flex flex-col gap-3">
                        <p className="text-[13px] font-medium text-[#22B4E6] custom-font-jura">
                            Upload Invoice
                        </p>

                        <div>
                            <CustomButton
                                type="button"
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Upload Invoice
                            </CustomButton>
                        </div>

                        {/* Hidden Input for Invoice (single file only) */}
                        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />

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
                    </div>

                    {/* ── Divider ────────────────────────────────────────── */}
                    <div className="border-t border-[#F0F4F8]" />

                    {/* ── Upload Attachment section ──────────────────────── */}
                    <div className="flex flex-col gap-3">
                        <p className="text-[13px] font-medium text-[#22B4E6] custom-font-jura">
                            Upload Attachment
                        </p>

                        <div>
                            <CustomButton
                                type="button"
                                variant="primary"
                                onClick={() => attachmentInputRef.current?.click()}
                            >
                                Upload Attachment
                            </CustomButton>
                        </div>

                        {/* Hidden Input for Attachment */}
                        <input ref={attachmentInputRef} type="file" multiple className="hidden" onChange={handleAttachmentInput} />

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
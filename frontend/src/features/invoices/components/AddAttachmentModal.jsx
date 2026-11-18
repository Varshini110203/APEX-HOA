import React, { useState, useEffect, useRef } from "react";
import { Modal, message } from "antd";
import { Paperclip, Trash2 } from "lucide-react";
import CustomButton from "../../../shared/components/CustomButton";
import { uploadInvoiceAttachments } from "../../../api/invoiceApi";

const formatSize = (bytes) => {
    if (bytes === undefined || bytes === null) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const AddAttachmentModal = ({ open, invoiceId, onCancel, onSuccess }) => {
    const [files, setFiles] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [confirmLoading, setConfirmLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const fileInputRef = useRef(null);

    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        if (!open) {
            setFiles([]);
            setIsDragging(false);
            setConfirmLoading(false);
            setUploadProgress(0);
            setErrorMessage("");
        }
    }, [open]);

    const handleFiles = (incoming) => {
        setErrorMessage("");
        const allFiles = Array.from(incoming);
        const allowedTypes = [
            "application/pdf", 
            "image/jpeg", 
            "image/jpg", 
            "image/png",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/csv"
        ];
        const allowedExts = [".pdf", ".jpg", ".jpeg", ".png", ".xls", ".xlsx", ".csv"];

        const validFiles = allFiles.filter((f) => {
            const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
            return allowedTypes.includes(f.type) || allowedExts.includes(ext);
        });

        if (validFiles.length < allFiles.length) {
            message.warning("Some files were skipped. Only PDF, JPG, JPEG, PNG, XLS, XLSX, and CSV are allowed.");
        }

        setFiles((prev) => {
            const existing = new Set(prev.map(f => f.name));
            const newFiles = validFiles.filter((f) => !existing.has(f.name));
            return [...prev, ...newFiles];
        });
    };

    const handleFileInput = (e) => handleFiles(e.target.files);

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => setIsDragging(false);

    const handleDelete = (fileToDelete) => {
        setFiles((prev) => prev.filter((f) => f.name !== fileToDelete.name));
        setErrorMessage("");
    };

    const handleUpload = async () => {
        if (files.length === 0) return;
        setErrorMessage("");

        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit
        const oversizedFiles = files.filter((f) => f.size > MAX_FILE_SIZE);

        if (oversizedFiles.length > 0) {
            const names = oversizedFiles.map(f => `"${f.name}"`).join(", ");
            setErrorMessage(`File size exceeds limit: ${names} ${oversizedFiles.length > 1 ? 'exceed' : 'exceeds'} maximum allowed size of 50MB.`);
            return;
        }

        setConfirmLoading(true);
        setUploadProgress(10);

        try {
            const formData = new FormData();
            files.forEach((file) => {
                formData.append("files", file);
            });

            // Simulate progress up to 90%
            const interval = setInterval(() => {
                setUploadProgress((p) => {
                    if (p >= 90) {
                        clearInterval(interval);
                        return p;
                    }
                    return p + 15;
                });
            }, 200);

            await uploadInvoiceAttachments(invoiceId, formData);
            clearInterval(interval);
            setUploadProgress(100);
            message.success("Attachments uploaded successfully.");
            onSuccess?.();
            onCancel();
        } catch (err) {
            console.error("Error uploading attachments:", err);
            message.error(err.response?.data?.detail || "Upload failed.");
            setUploadProgress(0);
        } finally {
            setConfirmLoading(false);
        }
    };

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            footer={null}
            title={null}
            width={660}
            centered
            destroyOnClose
            maskClosable={false}
            closeIcon={null}
            styles={{
                content: {
                    padding: 0,
                    borderRadius: "12px",
                    overflow: "hidden"
                },
                body: {
                    padding: 0
                }
            }}
        >
            <div className="flex flex-col bg-white">
                {/* Header */}
                <div className="px-6 py-3 border-b border-[#E0E0E0] flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold text-[#2F3A4C] custom-font-jura">
                        Add Attachments
                    </h2>
                    <button
                        onClick={onCancel}
                        disabled={confirmLoading}
                        className="text-gray-400 hover:text-gray-600 text-lg cursor-pointer bg-transparent border-0"
                    >
                        ×
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 flex flex-col gap-4">
                    <p className="text-[14px] text-[#22B4E6] custom-font-jura font-medium">
                        Upload Attachment Files
                    </p>

                    {/* Drop Zone */}
                    <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        className={`
                            border border-dashed rounded-xl
                            flex flex-col items-center justify-center
                            py-8 px-4 transition-all
                            ${isDragging ? "border-[#22B4E6] bg-[#F0FAFF]" : "border-[#D9E1E7] bg-[#FAFCFE]"}
                        `}
                    >
                        {/* Icon */}
                        <div className="mb-2">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                                <path d="M12 15V5M12 5L8.5 8.5M12 5L15.5 8.5"
                                    stroke="#94A3B8"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                />
                                <path d="M4 19H20"
                                    stroke="#94A3B8"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                />
                            </svg>
                        </div>

                        {/* Text */}
                        <p className="text-[13px] text-gray-500 text-center mb-3">
                            Drag and drop files here
                        </p>

                        {/* Upload Button */}
                        <CustomButton
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={confirmLoading}
                        >
                            Upload File
                        </CustomButton>

                        {/* Hidden Input */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,image/jpeg,image/jpg,image/png,.xls,.xlsx,.csv"
                            multiple
                            className="hidden"
                            onChange={handleFileInput}
                        />
                    </div>

                    {/* File List */}
                    {files.length > 0 && (
                        <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                            {files.map((file, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#E6ECF1]"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-7 h-7 rounded-md bg-[#E8F7FD] flex items-center justify-center">
                                            <Paperclip size={14} className="text-[#22B4E6]" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[13px] text-[#2F3A4C] truncate font-medium">
                                                {file.name}
                                            </p>
                                            <p className="text-[11px] text-gray-400">
                                                {formatSize(file.size)}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(file);
                                        }}
                                        disabled={confirmLoading}
                                        className="text-[#F87171] hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed bg-transparent border-0 cursor-pointer"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {confirmLoading && (
                    <div className="px-6 pb-3">
                        {/* Track */}
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

                        {/* Labels */}
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

                {errorMessage && (
                    <div className="px-6 pb-2 text-[12px] text-red-500 font-medium">
                        {errorMessage}
                    </div>
                )}

                {/* Footer */}
                <div className="flex justify-end gap-3 py-3 px-6 border-t border-[#E0E0E0]">
                    <button
                        onClick={onCancel}
                        disabled={confirmLoading}
                        className="px-5 py-1.5 text-[13px] rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer bg-white"
                    >
                        Discard
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={files.length === 0 || confirmLoading}
                        className="px-5 py-1.5 text-[13px] rounded-md bg-[#22B4E6] text-white hover:bg-[#1DA1D1] disabled:opacity-50 cursor-pointer border-0 font-medium"
                    >
                        {confirmLoading ? "Uploading..." : "Upload"}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default AddAttachmentModal;

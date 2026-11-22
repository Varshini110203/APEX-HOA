import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { DownloadOutlined, EyeOutlined, LoadingOutlined, SearchOutlined } from '@ant-design/icons';
import { formatCurrency, formatIST } from '../../utils/formatters';
import { getInvoicePdf, getInvoices } from '../../api/invoiceApi';
import { useInvoiceData } from '../hooks/useInvoiceData';
import { StatusBadge, getStatusLabel, getNextApprover } from '../invoices/invoiceColumns';
import DataTable from '../../components/ui/DataTable';
import ExportButton from '../../shared/components/ExportButton';
import toast from '../../utils/toast';

/*
// ─── Commented Charts & Cards (Preserved) ──────────────────────────────────
import Card from './charts/Card';
import { icons } from '../../file';
import BarChart from './charts/BarChart';
import DonutChart from './charts/DonutChart';
import { useDashboardData } from '../hooks/useDashboardData';
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { Spin } from "antd";
import { getERPSystem } from '../../utils/envHelper';

const CARD_SKELETONS = Array(4).fill(0);
const CHART_SKELETONS = Array(2).fill(0);
*/

const DashboardPage = React.memo(() => {
    const navigate = useNavigate();

    // Table state
    const [skip, setSkip] = useState(0);
    const [limit, setLimit] = useState(15);
    const [sortColumn, setSortColumn] = useState("uploaded_at");
    const [sortDirection, setSortDirection] = useState("desc");
    const [localSearch, setLocalSearch] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [downloadingId, setDownloadingId] = useState(null);

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localSearch !== searchQuery) {
                setSearchQuery(localSearch);
                setSkip(0);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [localSearch, searchQuery]);

    // Fetch all invoices without filtering (tab: "all")
    const { invoices, total, isLoading } = useInvoiceData({
        skip,
        limit,
        search: searchQuery,
        sort_by: sortColumn,
        sort_dir: sortDirection,
        tab: "all"
    });

    // Handle single invoice PDF download
    const handleDownloadPdf = useCallback(async (row) => {
        if (!row?.id) return;
        setDownloadingId(row.id);
        const hideMsg = message.loading(`Preparing download for invoice ${row.invoice_number || row.id}...`, 0);
        try {
            const isArchived = row.status === 'archived' || row.is_archived;
            const blob = await getInvoicePdf(row.id, isArchived);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            const baseName = row.original_filename || row.invoice_number || `invoice_${row.id}`;
            link.download = baseName.toLowerCase().endsWith('.pdf') ? baseName : `${baseName}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success(`Invoice ${row.invoice_number || row.id} downloaded successfully.`);
        } catch (err) {
            console.error("Failed to download invoice PDF:", err);
            toast.error("Failed to download invoice PDF.");
        } finally {
            hideMsg();
            setDownloadingId(null);
        }
    }, []);

    // Handle view invoice in viewer
    const handleView = useCallback((row) => {
        navigate('/invoices', { state: { viewInvoice: row, from: '/dashboard' } });
    }, [navigate]);

    // Export all invoices without filtering
    const handleFetchAllForExport = useCallback(async () => {
        try {
            const res = await getInvoices({
                skip: 0,
                limit: 10000,
                show_all: true,
                tab: "all",
                sort_by: sortColumn,
                sort_dir: sortDirection
            });
            return res?.data || [];
        } catch (err) {
            console.error("Export fetch error:", err);
            toast.error("Failed to fetch all invoices for export.");
            return [];
        }
    }, [sortColumn, sortDirection]);

    // Columns for Excel export
    const exportColumns = useMemo(() => [
        { header: "Request ID", accessor: (row) => row.request_id || row.requestNo || row.requestId || "-" },
        { header: "Vendor Name", accessor: (row) => row?.extracted_data?.vendor_info?.name?.value || "-" },
        { header: "Vendor ID", accessor: "vendor_id" },
        { header: "Invoice Number", accessor: "invoice_number" },
        { header: "Total Amount", accessor: (row) => formatCurrency(row?.extracted_data?.amounts?.total_invoice_amount?.value) },
        { header: "Amount Due", accessor: (row) => formatCurrency(row?.extracted_data?.amounts?.amount_due?.value) },
        { header: "Uploaded By", accessor: "uploaded_by" },
        { header: "Status", accessor: (row) => getStatusLabel(row.status, row?.current_approver_level, row) },
        { header: "Next Action By", accessor: (row) => getNextApprover(row) },
        { header: "Last Modified By", accessor: (row) => row.last_modified_by || "-" },
        { header: "Action Time", accessor: (row) => formatIST(row?.updated_at) },
        { header: "Entity", accessor: "entity" },
    ], []);

    // Table Columns definition
    const columns = useMemo(() => [
        {
            header: "Request ID",
            accessor: "request_id",
            sortable: true,
            render: (val, row) => val || row?.requestNo || row?.requestId || "-",
        },
        {
            header: "Vendor Name",
            accessor: "vendor_name",
            sortable: true,
            getFilterValue: (row) => row?.extracted_data?.vendor_info?.name?.value ?? "",
            render: (_, row) => row?.extracted_data?.vendor_info?.name?.value ?? "-",
        },
        {
            header: "Vendor ID",
            accessor: "vendor_id",
            sortable: true,
        },
        {
            header: "Invoice Number",
            accessor: "invoice_number",
            sortable: true,
        },
        {
            header: "Total Amount",
            accessor: "total_amount",
            sortable: true,
            render: (_, row) => formatCurrency(row?.extracted_data?.amounts?.total_invoice_amount?.value),
        },
        {
            header: "Amount Due",
            accessor: "amount_due",
            sortable: true,
            render: (_, row) => formatCurrency(row?.extracted_data?.amounts?.amount_due?.value),
        },
        {
            header: "Uploaded By",
            accessor: "uploaded_by",
            sortable: true,
        },
        {
            header: "Status",
            accessor: "status",
            sortable: true,
            render: (val, row) => (
                <StatusBadge
                    value={val}
                    level={row?.current_approver_level}
                    label={row?.status_label}
                />
            ),
        },
        {
            header: "Next Action By",
            accessor: "next_approver",
            render: (_, row) => getNextApprover(row),
        },
        {
            header: "Last Modified By",
            accessor: "last_modified_by",
            render: (val) => val || "-",
        },
        {
            header: "Action Time",
            accessor: "action_time",
            render: (_, row) => formatIST(row?.updated_at),
        },
        {
            header: "Entity",
            accessor: "entity",
            sortable: true,
        },
        {
            header: "Actions",
            accessor: "actions",
            sortable: false,
            render: (_, row) => {
                const isDownloading = downloadingId === row.id;
                return (
                    <div className="flex items-center justify-center gap-3">
                        <button
                            onClick={() => handleDownloadPdf(row)}
                            disabled={isDownloading}
                            className="text-[#24A1DD] hover:text-[#1d82b2] transition-colors cursor-pointer disabled:opacity-50"
                            title="Download Invoice PDF"
                        >
                            {isDownloading ? (
                                <LoadingOutlined style={{ fontSize: 16 }} spin />
                            ) : (
                                <DownloadOutlined style={{ fontSize: 16 }} />
                            )}
                        </button>
                        <button
                            onClick={() => handleView(row)}
                            className="text-blue-500 hover:text-blue-700 transition-colors cursor-pointer"
                            title="View Invoice"
                        >
                            <EyeOutlined style={{ fontSize: 16 }} />
                        </button>
                    </div>
                );
            },
        },
    ], [downloadingId, handleDownloadPdf, handleView]);

    return (
        <div className="relative bg-[#F7F7F7] p-4 space-y-4 min-h-[400px]">
            {/* Top Toolbar: Search & Export/Download */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <h1 className="text-xl font-bold text-gray-800">All Invoices</h1>
                    <span className="text-xs bg-[#24A1DD]/10 text-[#24A1DD] px-2.5 py-1 rounded-full font-semibold">
                        {total} {total === 1 ? 'Invoice' : 'Invoices'}
                    </span>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                    {/* Search Input */}
                    <div className="relative w-full sm:w-72">
                        <SearchOutlined className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search invoices..."
                            value={localSearch}
                            onChange={(e) => setLocalSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-[#24A1DD] focus:bg-white transition-colors"
                        />
                    </div>

                    {/* Export to Excel Button */}
                    <ExportButton
                        fetchData={handleFetchAllForExport}
                        columns={exportColumns}
                        fileName="All_Invoices_Dashboard.xlsx"
                        label="Download All"
                        className="!h-9 !px-4 whitespace-nowrap"
                    />
                </div>
            </div>

            {/* Invoices Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <DataTable
                    columns={columns}
                    data={invoices ?? []}
                    loading={isLoading}
                    totalItems={total}
                    currentPage={Math.floor(skip / limit) + 1}
                    itemsPerPage={limit}
                    onPageChange={(page) => setSkip((page - 1) * limit)}
                    onItemsPerPageChange={(newLimit) => {
                        setLimit(newLimit);
                        setSkip(0);
                    }}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={(col, dir) => {
                        setSortColumn(col);
                        setSortDirection(dir);
                    }}
                    maxHeight="calc(100vh - 270px)"
                    stickyHeader={true}
                    transparent={true}
                />
            </div>

            {/* 
            // ─── Commented Dashboard Cards & Charts ──────────────────────────────
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card icon={icons.invoice} title="Total Invoices" value={summary?.total_invoices} />
                <Card icon={icons.overdue} title="Total Overdue" value={formatCurrency(summary?.total_due || 0)} />
                <Card icon={icons.approved} title={`Posted to ${getERPSystem()}`} value={summary?.sage_posted} />
                <Card icon={icons.pending} title="Pending Approval" value={summary?.waiting_approval} />
            </div>

            <div className="flex gap-4">
                <div className="w-[50%]">
                    <BarChart title="Payables Aging" x={agingX} y={agingY} yMax={agingYMax} unit="" />
                </div>
                <div className="w-[50%]">
                    <DonutChart title="Status Breakdown" labels={statusLabels} values={statusValues} centerText="Total" centerValue={statusTotal} />
                </div>
            </div>

            <div className="flex gap-4">
                <div className="w-[50%]">
                    <BarChart title="Vendors by Amount" x={vendorX} y={vendorY} yMax={vendorYMax} colors={vendorColors} unit="" />
                </div>
                <div className="w-[50%]">
                    <BarChart title="Top Vendors" x={topVendorX} y={topVendorY} yMax={topVendorYMax} colors={topVendorColors} unit="" />
                </div>
            </div>
            */}
        </div>
    );
});

export default DashboardPage;

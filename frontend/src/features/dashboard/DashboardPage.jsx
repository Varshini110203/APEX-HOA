import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { DownloadOutlined, EyeOutlined, LoadingOutlined, SearchOutlined } from '@ant-design/icons';
import { formatCurrency, formatIST } from '../../utils/formatters';
import { getInvoicePdf, getInvoices, getInvoiceFilterOptions } from '../../api/invoiceApi';
import { useInvoiceData } from '../hooks/useInvoiceData';
import { StatusBadge, getStatusLabel, getNextApprover } from '../invoices/invoiceColumns';
import DataTable from '../../components/ui/DataTable';
import ExportButton from '../../shared/components/ExportButton';
import toast from '../../utils/toast';

const ACCESSOR_TO_DB_FIELD = {
    request_id: "request_id",
    vendor_name: "vendor_name",
    vendor_code: "vendor_code",
    vendor_id: "vendor_id",
    invoice_number: "invoice_number",
    invoice_date: "invoice_date",
    due_date: "due_date",
    loan_number: "loan_number",
    total_amount: "total_amount",
    amount_due: "amount_due",
    payment_terms: "payment_terms",
    payment_method: "payment_method",
    any_fee_applicable: "any_fee_applicable",
    fee_amount: "fee_amount",
    expense_type: "expense_type",
    payment_reference: "payment_reference",
    expense_category: "expense_category",
    uploaded_by: "uploaded_by",
    status: "status",
    next_approver: "next_approver",
    last_modified_by: "last_modified_by",
    action_time: "updated_at",
    entity: "entity",
    uploaded_at: "uploaded_at",
};

const DashboardPage = React.memo(() => {
    const navigate = useNavigate();

    // Table state
    const [skip, setSkip] = useState(0);
    const [limit, setLimit] = useState(15);
    const [sortColumn, setSortColumn] = useState("uploaded_at");
    const [sortDirection, setSortDirection] = useState("desc");
    const [localSearch, setLocalSearch] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [columnFilters, setColumnFilters] = useState({});
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

    const backendFilters = useMemo(() => {
        const filters = {};
        Object.entries(columnFilters).forEach(([accessor, value]) => {
            if (!value) return;
            const dbField = ACCESSOR_TO_DB_FIELD[accessor] || accessor;

            if (value instanceof Set) {
                if (value.size > 0) {
                    filters[dbField] = Array.from(value);
                }
            } else if (Array.isArray(value)) {
                if (value.length > 0) {
                    filters[dbField] = value;
                }
            } else if (typeof value === 'object' && value.op) {
                if (value.op === 'between') {
                    if (Array.isArray(value.val) && (value.val[0] || value.val[1])) {
                        filters[dbField] = { op: 'between', val: value.val };
                    }
                } else if (value.val !== "" && value.val !== undefined) {
                    filters[dbField] = { op: value.op, val: parseFloat(value.val) };
                }
            } else if (typeof value === 'string' && value.trim()) {
                filters[dbField] = value.trim();
            }
        });
        return filters;
    }, [columnFilters]);

    useEffect(() => {
        setSkip(0);
    }, [columnFilters]);

    // Fetch all invoices without filtering (tab: "all")
    const { invoices, total, isLoading } = useInvoiceData({
        skip,
        limit,
        search: searchQuery,
        filters: backendFilters,
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

    // Export all invoices without filtering / pagination limit
    const handleFetchAllForExport = useCallback(async () => {
        try {
            const res = await getInvoices({
                skip: 0,
                limit: -1,
                show_all: true,
                tab: "all",
                filters: Object.keys(backendFilters).length > 0 ? backendFilters : undefined,
                search: searchQuery || undefined,
                sort_by: sortColumn,
                sort_dir: sortDirection
            });
            return res?.data || [];
        } catch (err) {
            console.error("Export fetch error:", err);
            toast.error("Failed to fetch all invoices for export.");
            return [];
        }
    }, [sortColumn, sortDirection, backendFilters, searchQuery]);

    const exportColumns = useMemo(() => [
        { 
            header: "Request Number", 
            accessor: (row) => row.request_id || row.requestNo || row.requestId || "-" 
        },
        { 
            header: "Vendor Name", 
            accessor: (row) => row.vendor_name || row?.vendorName || row?.extracted_data?.vendor_info?.name?.value || "-" 
        },
        { 
            header: "Vendor Code", 
            accessor: (row) => row.vendor_code || row.vendor_id || row.vendorId || "-" 
        },
        { 
            header: "Invoice Number", 
            accessor: (row) => row.invoice_number || row.invoiceNumber || "-" 
        },
        { 
            header: "Vendor Invoice Date", 
            accessor: (row) => row.invoice_date || row.invoiceDate || row?.extracted_data?.invoice_details?.invoice_date?.value || "-" 
        },
        { 
            header: "Due Date", 
            accessor: (row) => row.due_date ? new Date(row.due_date).toLocaleDateString() : "-" 
        },
        { 
            header: "Loan Number", 
            accessor: (row) => row.loan_number || row.loanNumber || row?.extracted_data?.invoice_details?.loan_number?.value || "-" 
        },
        { 
            header: "Vendor Invoice Amount", 
            accessor: (row) => formatCurrency(row.total_amount ?? row.totalAmount ?? row?.extracted_data?.amounts?.total_invoice_amount?.value) 
        },
        { 
            header: "Amount Due", 
            accessor: (row) => formatCurrency(row.amount_due ?? row?.extracted_data?.amounts?.amount_due?.value) 
        },
        { 
            header: "Payment Term", 
            accessor: (row) => row.payment_terms || row.paymentTerms || "-" 
        },
        { 
            header: "Payment Method", 
            accessor: (row) => row.payment_method || row.paymentMethod || "-" 
        },
        { 
            header: "Any Fee Applicable?", 
            accessor: (row) => row.any_fee_applicable || row.anyFeeApplicable || row.feeApplicable || "-" 
        },
        { 
            header: "Fee Amount", 
            accessor: (row) => (row.fee_amount != null || row.feeAmount != null) ? formatCurrency(row.fee_amount ?? row.feeAmount) : "-" 
        },
        { 
            header: "Expense Type", 
            accessor: (row) => row.expense_type || row.expenseType || "-" 
        },
        { 
            header: "Payment Reference", 
            accessor: (row) => row.payment_reference || row.paymentReference || "-" 
        },
        { 
            header: "Expense Category", 
            accessor: (row) => row.expense_category || row.expenseCategory || "-" 
        },
        { 
            header: "Uploaded By", 
            accessor: (row) => row.uploaded_by || "-" 
        },
        { 
            header: "Status", 
            accessor: (row) => getStatusLabel(row.status, row?.current_approver_level, row) 
        },
        { 
            header: "Next Action By", 
            accessor: (row) => getNextApprover(row) 
        },
        { 
            header: "Last Modified By", 
            accessor: (row) => row.last_modified_by || "-" 
        },
        { 
            header: "Action Time", 
            accessor: (row) => formatIST(row?.updated_at) 
        },
        { 
            header: "Entity", 
            accessor: (row) => row.entity || "-" 
        },
    ], []); 

    // Table Columns definition: All HOA fields with filtering enabled
    const columns = useMemo(() => {
        const cols = [
            {
                header: "Request ID",
                accessor: "request_id",
                sortable: true,
                filterable: true,
                render: (val, row) => val || row?.requestNo || row?.requestId || "-",
            },
            {
                header: "Vendor Name",
                accessor: "vendor_name",
                sortable: true,
                filterable: true,
                getFilterValue: (row) => row?.vendor_name || row?.vendorName || row?.extracted_data?.vendor_info?.name?.value || "",
                render: (val, row) => val || row?.vendorName || row?.extracted_data?.vendor_info?.name?.value || "-",
            },
            {
                header: "Vendor Code",
                accessor: "vendor_code",
                sortable: true,
                filterable: true,
                getFilterValue: (row) => row?.vendor_code || row?.vendor_id || row?.vendorId || "",
                render: (val, row) => val || row?.vendor_id || row?.vendorId || "-",
            },
            {
                header: "Invoice Number",
                accessor: "invoice_number",
                sortable: true,
                filterable: true,
                render: (val, row) => val || row?.invoiceNumber || "-",
            },
            {
                header: "Vendor Invoice Date",
                accessor: "invoice_date",
                sortable: true,
                filterable: true,
                filterType: 'date',
                render: (val, row) => val ? new Date(val).toLocaleDateString() : (row?.invoiceDate || row?.extracted_data?.invoice_details?.invoice_date?.value || "-"),
            },
            {
                header: "Due Date",
                accessor: "due_date",
                sortable: true,
                filterable: true,
                filterType: 'date',
                render: (val) => val ? new Date(val).toLocaleDateString() : "-",
            },
            {
                header: "Loan Number",
                accessor: "loan_number",
                sortable: true,
                filterable: true,
                getFilterValue: (row) => row?.loan_number || row?.loanNumber || row?.extracted_data?.invoice_details?.loan_number?.value || "",
                render: (val, row) => val || row?.loanNumber || row?.extracted_data?.invoice_details?.loan_number?.value || "-",
            },
            {
                header: "Vendor Invoice Amount",
                accessor: "total_amount",
                sortable: true,
                filterable: true,
                filterType: 'number',
                filterRender: (val) => formatCurrency(val),
                render: (val, row) => formatCurrency(val ?? row?.totalAmount ?? row?.extracted_data?.amounts?.total_invoice_amount?.value),
            },
            {
                header: "Amount Due",
                accessor: "amount_due",
                sortable: true,
                filterable: true,
                filterType: 'number',
                filterRender: (val) => formatCurrency(val),
                render: (val, row) => formatCurrency(val ?? row?.extracted_data?.amounts?.amount_due?.value),
            },
            {
                header: "Payment Term",
                accessor: "payment_terms",
                sortable: true,
                filterable: true,
                render: (val, row) => val || row?.paymentTerms || "-",
            },
            {
                header: "Payment Method",
                accessor: "payment_method",
                sortable: true,
                filterable: true,
                render: (val, row) => val || row?.paymentMethod || "-",
            },
            {
                header: "Any Fee Applicable?",
                accessor: "any_fee_applicable",
                sortable: true,
                filterable: true,
                render: (val, row) => val || row?.anyFeeApplicable || row?.feeApplicable || "-",
            },
            {
                header: "Fee Amount",
                accessor: "fee_amount",
                sortable: true,
                filterable: true,
                filterType: 'number',
                filterRender: (val) => formatCurrency(val),
                render: (val, row) => (val != null || row?.feeAmount != null) ? formatCurrency(val ?? row?.feeAmount) : "-",
            },
            {
                header: "Expense Type",
                accessor: "expense_type",
                sortable: true,
                filterable: true,
                render: (val, row) => val || row?.expenseType || "-",
            },
            {
                header: "Payment Reference",
                accessor: "payment_reference",
                sortable: true,
                filterable: true,
                render: (val, row) => val || row?.paymentReference || "-",
            },
            {
                header: "Expense Category",
                accessor: "expense_category",
                sortable: true,
                filterable: true,
                render: (val, row) => val || row?.expenseCategory || "-",
            },
            {
                header: "Uploaded By",
                accessor: "uploaded_by",
                sortable: true,
                filterable: true,
                render: (val) => val || "-",
            },
            {
                header: "Status",
                accessor: "status",
                sortable: true,
                filterable: true,
                filterRender: (val) => getStatusLabel(val),
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
                sortable: false,
                filterable: true,
                getFilterValue: (row) => getNextApprover(row),
                render: (_, row) => getNextApprover(row),
            },
            {
                header: "Last Modified By",
                accessor: "last_modified_by",
                sortable: false,
                filterable: true,
                render: (val) => val || "-",
            },
            {
                header: "Action Time",
                accessor: "action_time",
                sortable: true,
                filterable: true,
                filterType: 'date',
                getFilterValue: (row) => formatIST(row?.updated_at),
                render: (_, row) => formatIST(row?.updated_at),
            },
            {
                header: "Entity",
                accessor: "entity",
                sortable: true,
                filterable: true,
                render: (val) => val || "-",
            },
            {
                header: "Actions",
                accessor: "actions",
                sortable: false,
                filterable: false,
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
        ];

        return cols.map(col => ({
            ...col,
            onGetOptions: col.filterable ? async (accessor, search) => {
                const dbField = ACCESSOR_TO_DB_FIELD[accessor] || accessor;
                const otherFilters = { ...backendFilters };
                delete otherFilters[dbField];
                return await getInvoiceFilterOptions(dbField, otherFilters, "all", search);
            } : undefined
        }));
    }, [downloadingId, handleDownloadPdf, handleView, backendFilters]);

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
                            placeholder="Search invoices, loan number..."
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
                    enableColumnFilters={true}
                    columnFilters={columnFilters}
                    onColumnFiltersChange={setColumnFilters}
                    transparent={true}
                />
            </div>
        </div>
    );
});

export default DashboardPage;

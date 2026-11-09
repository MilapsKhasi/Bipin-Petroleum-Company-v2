import React from 'react';
import { X, FileSpreadsheet, FileText, Printer, FileDown } from 'lucide-react';
import Modal from './Modal';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (type: 'excel' | 'csv' | 'pdf') => void;
  reportName: string;
}

const ExportOption = ({ 
    icon: Icon, 
    title, 
    desc, 
    onClick, 
    disabled = false,
    variant = 'default'
}: { 
    icon: any, 
    title: string, 
    desc: string, 
    onClick?: () => void, 
    disabled?: boolean,
    variant?: 'default' | 'primary'
}) => (
    <button 
        onClick={onClick}
        disabled={disabled}
        className={`flex items-start p-4 border rounded-lg text-left transition-all w-full relative group ${
            disabled 
            ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-70' 
            : 'bg-white border-slate-200 hover:border-slate-400 hover:bg-slate-50'
        }`}
    >
        <div className={`p-3 rounded-lg mr-4 ${variant === 'primary' ? 'bg-primary/20 text-slate-700' : 'bg-slate-100 text-slate-500'} group-hover:scale-110 transition-transform`}>
            <Icon className="w-5 h-5" />
        </div>
        <div>
            <h4 className={`font-bold text-[13px] mb-0.5 ${disabled ? 'text-slate-500' : 'text-slate-900'}`}>{title}</h4>
            <p className="text-[11px] text-slate-400">{desc}</p>
        </div>
    </button>
);

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, onExport, reportName }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Document" maxWidth="max-w-md">
        <div className="p-6 space-y-6">
            <div className="bg-slate-50 p-4 border border-slate-200 rounded-md">
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Active View</p>
                <p className="text-[14px] font-semibold text-slate-900">{reportName}</p>
            </div>

            <div className="space-y-3">
                <ExportOption 
                    icon={FileSpreadsheet} 
                    title="Microsoft Excel (.xlsx)" 
                    desc="Full ledger with company branding and formatting." 
                    onClick={() => onExport('excel')} 
                    variant="primary"
                />
                
                <ExportOption 
                    icon={FileText} 
                    title="Comma Separated (.csv)" 
                    desc="Raw data table for external analysis." 
                    onClick={() => onExport('csv')} 
                />
                
                <ExportOption 
                    icon={Printer} 
                    title="Print / Save as PDF" 
                    desc="Generate a professional printable statement." 
                    onClick={() => onExport('pdf')} 
                />
            </div>

            <div className="pt-4 text-center">
                <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                    Exports include your active filters and company metadata.
                </p>
            </div>
        </div>
    </Modal>
  );
};

export default ExportModal;
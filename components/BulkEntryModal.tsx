
import React, { useState, useEffect, useCallback } from 'react';
import { X, Undo, Redo, Share2, RotateCcw, Eraser, Check, Plus, Loader2 } from 'lucide-react';
import Modal from './Modal';
import FormActionButtons from './FormActionButtons';
import { toast } from '../utils/toast';

export interface ColumnDef {
  header: string;
  key: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[]; // For select type
  width?: string;
  // Placeholder removed
}

interface BulkEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  columns: ColumnDef[];
  onSave: (data: any[]) => void;
}

const INITIAL_ROWS = 50;

const BulkEntryModal: React.FC<BulkEntryModalProps> = ({ isOpen, onClose, title, columns, onSave }) => {
  const [loading, setLoading] = useState(false);
  // Initialize grid with empty strings
  const createEmptyRows = (count: number) => Array(count).fill(null).map(() => 
    columns.reduce((acc, col) => ({ ...acc, [col.key]: '' }), {})
  );

  const [gridData, setGridData] = useState<any[]>([]);
  const [history, setHistory] = useState<any[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      const initial = createEmptyRows(INITIAL_ROWS);
      setGridData(initial);
      setHistory([initial]);
      setHistoryIndex(0);
    }
  }, [isOpen, columns]);

  const addToHistory = (newData: any[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newData))); // Deep copy
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleCellChange = (rowIndex: number, key: string, value: string) => {
    const newData = [...gridData];
    newData[rowIndex] = { ...newData[rowIndex], [key]: value };
    setGridData(newData);
  };

  const handleBlur = () => {
    // Commit to history on blur (to avoid history spam on every keystroke)
    // Only if different from current history head
    if (history.length > 0 && JSON.stringify(gridData) !== JSON.stringify(history[historyIndex])) {
        addToHistory(gridData);
    }
  };

  const handleAddRows = () => {
    const newRows = createEmptyRows(10);
    const newData = [...gridData, ...newRows];
    setGridData(newData);
    addToHistory(newData);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setGridData(JSON.parse(JSON.stringify(history[historyIndex - 1])));
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setGridData(JSON.parse(JSON.stringify(history[historyIndex + 1])));
    }
  };

  const handleReset = () => {
      const initial = createEmptyRows(INITIAL_ROWS);
      setGridData(initial);
      setHistory([initial]);
      setHistoryIndex(0);
  };

  const handleClearAll = () => {
      if (confirm('Are you sure you want to clear all data?')) {
          // Keep the rows, just clear content
          const cleared = gridData.map(() => columns.reduce((acc, col) => ({ ...acc, [col.key]: '' }), {}));
          setGridData(cleared);
          addToHistory(cleared);
      }
  };

  const handleShare = () => {
      const textData = gridData.map(row => Object.values(row).join('\t')).join('\n');
      navigator.clipboard.writeText(textData);
      toast.success('Table data copied to clipboard.');
  };

  const handleCreate = async () => {
      if (loading) return;
      // Filter out empty rows
      const validRows = gridData.filter(row => {
          return Object.values(row).some(val => val !== '' && val !== null);
      });
      
      if (validRows.length === 0) {
          toast.warning("Please enter at least one row of data.");
          return;
      }

      setLoading(true);
      try {
        await onSave(validRows);
      } finally {
        setLoading(false);
      }
  };

  const TooltipButton = ({ icon: Icon, onClick, tip, disabled = false }: any) => (
      <button 
        onClick={onClick} 
        disabled={disabled}
        className={`p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative group ${disabled ? 'opacity-50 cursor-not-allowed' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
      >
          <Icon className="w-5 h-5" />
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              {tip}
          </span>
      </button>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-[95vw]">
      <div className="flex flex-col h-[80vh]">
        {/* Toolbar */}
        <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-3 mb-3 shrink-0">
            <div className="flex items-center border-r border-slate-200 dark:border-slate-800 pr-2 mr-2 space-x-1">
                <TooltipButton icon={Undo} onClick={handleUndo} tip="Undo" disabled={historyIndex === 0} />
                <TooltipButton icon={Redo} onClick={handleRedo} tip="Redo" disabled={historyIndex === history.length - 1} />
            </div>
            <div className="flex items-center space-x-1">
                <TooltipButton icon={Share2} onClick={handleShare} tip="Share / Copy" />
                <TooltipButton icon={RotateCcw} onClick={handleReset} tip="Reset Table" />
                <TooltipButton icon={Eraser} onClick={handleClearAll} tip="Clear All" />
            </div>
            <div className="flex-1"></div>
            <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-3 py-1 rounded text-xs font-bold border border-blue-100 dark:border-blue-800">
                Bulk Entry Mode
            </div>
        </div>

        {/* Spreadsheet Area */}
        <div className="flex-1 overflow-auto border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-inner relative custom-scrollbar">
            <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
                    <tr>
                        <th className="w-10 border-r border-b border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400 p-2 text-center uppercase">#</th>
                        {columns.map((col) => (
                            <th 
                                key={col.key} 
                                className="border-r border-b border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 p-2 text-left min-w-[120px] uppercase"
                                style={{ width: col.width }}
                            >
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {gridData.map((row, rIndex) => (
                        <tr key={rIndex} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors group">
                            <td className="border-r border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-400 dark:text-slate-500 text-center font-mono select-none group-hover:bg-blue-50/50 dark:group-hover:bg-blue-900/20">
                                {rIndex + 1}
                            </td>
                            {columns.map((col) => (
                                <td key={`${rIndex}-${col.key}`} className="border-r border-b border-slate-200 dark:border-slate-800 p-0 bg-white dark:bg-slate-900">
                                    {col.type === 'select' ? (
                                        <select
                                            value={row[col.key]}
                                            onChange={(e) => handleCellChange(rIndex, col.key, e.target.value)}
                                            onBlur={handleBlur}
                                            className="w-full h-full px-2 py-2 text-sm bg-transparent outline-none focus:bg-blue-50 dark:focus:bg-blue-900/20 focus:ring-2 focus:ring-inset focus:ring-blue-500/50 cursor-pointer text-slate-900 dark:text-white"
                                        >
                                            <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Select...</option>
                                            {col.options?.map(opt => (
                                                <option key={opt} value={opt} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{opt}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input 
                                            type="text"
                                            value={row[col.key]}
                                            onChange={(e) => handleCellChange(rIndex, col.key, e.target.value)}
                                            onBlur={handleBlur}
                                            className="w-full h-full px-2 py-2 text-sm bg-transparent outline-none focus:bg-blue-50 dark:focus:bg-blue-900/20 focus:ring-2 focus:ring-inset focus:ring-blue-500/50 font-normal text-slate-900 dark:text-white"
                                        />
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                    <tr>
                        <td colSpan={columns.length + 1} className="p-2 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
                             <button 
                                onClick={handleAddRows}
                                className="w-full py-2 text-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded border border-dashed border-slate-300 dark:border-slate-700 transition-colors text-sm font-medium flex items-center justify-center"
                             >
                                <Plus className="w-4 h-4 mr-2" /> Add 10 More Rows
                             </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        {/* Footer */}
        <div className="pt-4 mt-2">
            <FormActionButtons
                primaryText="Create Entries"
                primaryType="button"
                primaryOnClick={handleCreate}
                primaryDisabled={loading}
                primaryLoading={loading}

                secondaryLeftText="+ Add 10 Rows"
                secondaryLeftType="button"
                secondaryLeftOnClick={handleAddRows}
                secondaryLeftDisabled={loading}

                secondaryRightText="Clear All Data"
                secondaryRightType="button"
                secondaryRightOnClick={handleClearAll}
                secondaryRightDisabled={loading}

                discardText="Discard"
                discardOnClick={onClose}
                discardDisabled={loading}
            />
        </div>
      </div>
    </Modal>
  );
};

export default BulkEntryModal;

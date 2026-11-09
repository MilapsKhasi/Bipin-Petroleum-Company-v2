import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus } from 'lucide-react';

interface ItemSelectDropdownProps {
  value: string;
  stockItems: any[];
  onSelect: (item: any) => void;
  onAddNewItem: () => void;
  placeholder?: string;
}

const ItemSelectDropdown: React.FC<ItemSelectDropdownProps> = ({
  value,
  stockItems,
  onSelect,
  onAddNewItem,
  placeholder = "Select Item..."
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
    openUpwards: boolean;
  }>({
    left: 0,
    width: 280,
    maxHeight: 260,
    openUpwards: false
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const preferredHeight = 260;

    const openUpwards = spaceBelow < preferredHeight && spaceAbove > spaceBelow;

    if (openUpwards) {
      setCoords({
        bottom: window.innerHeight - rect.top + 4,
        left: Math.max(10, Math.min(rect.left, window.innerWidth - 300)),
        width: Math.max(rect.width, 280),
        maxHeight: Math.min(280, Math.max(150, spaceAbove - 20)),
        openUpwards: true
      });
    } else {
      setCoords({
        top: rect.bottom + 4,
        left: Math.max(10, Math.min(rect.left, window.innerWidth - 300)),
        width: Math.max(rect.width, 280),
        maxHeight: Math.min(280, Math.max(150, spaceBelow - 20)),
        openUpwards: false
      });
    }
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filteredItems = stockItems.filter(item => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      (item.name && item.name.toLowerCase().includes(term)) ||
      (item.sku && item.sku.toLowerCase().includes(term)) ||
      (item.hsn && item.hsn.toLowerCase().includes(term))
    );
  });

  const handleOpen = () => {
    setIsOpen(true);
    setSearchTerm('');
    setTimeout(() => {
      updatePosition();
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full min-w-[200px]">
      <div
        tabIndex={0}
        role="button"
        aria-expanded={isOpen}
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (!isOpen && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
            e.preventDefault();
            handleOpen();
          }
        }}
        className="w-full h-10 px-3 flex items-center justify-between cursor-pointer bg-transparent hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors focus:outline-none focus:ring-1 focus:ring-primary rounded"
      >
        {isOpen ? (
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              updatePosition();
            }}
            placeholder={value || placeholder}
            className="w-full h-full bg-transparent outline-none text-sm font-medium text-slate-900 dark:text-white uppercase placeholder:text-slate-400"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsOpen(false);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredItems.length > 0) {
                  onSelect(filteredItems[0]);
                  setIsOpen(false);
                } else {
                  setIsOpen(false);
                  onAddNewItem();
                }
              } else if (e.key === 'Tab') {
                setIsOpen(false);
              }
            }}
          />
        ) : (
          <span
            className={`w-full text-sm font-medium uppercase truncate ${
              value ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {value || placeholder}
          </span>
        )}
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1 pointer-events-none" />
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: coords.openUpwards ? 'auto' : `${coords.top}px`,
              bottom: coords.openUpwards ? `${coords.bottom}px` : 'auto',
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              maxHeight: `${coords.maxHeight}px`,
              zIndex: 99999
            }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl overflow-hidden flex flex-col divide-y divide-slate-100 dark:divide-slate-800"
          >
            {/* Top Option: + Add New Item */}
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setIsOpen(false);
                onAddNewItem();
              }}
              className="w-full text-left px-3 py-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between transition-colors sticky top-0 z-20 cursor-pointer shrink-0"
            >
              <span className="flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                + Add New Item
              </span>
              <span className="text-[10px] uppercase font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/80 px-2 py-0.5 rounded">
                Create Master
              </span>
            </button>

            {/* List of Stock Items */}
            <div className="overflow-y-auto custom-scrollbar flex-1 max-h-[220px]">
              {filteredItems.length === 0 ? (
                <div className="px-3 py-4 text-xs text-slate-400 dark:text-slate-500 text-center italic">
                  No matching item found. Click "+ Add New Item" above to create it.
                </div>
              ) : (
                filteredItems.map((item) => {
                  const qtyVal = item.in_stock !== undefined && item.in_stock !== null ? item.in_stock : 0;
                  const unitStr = item.unit ? ` ${item.unit}` : '';
                  const isSelected = item.name?.toLowerCase().trim() === value?.toLowerCase().trim();

                  return (
                    <div
                      key={item.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelect(item);
                        setIsOpen(false);
                      }}
                      className={`px-3 py-2.5 text-xs cursor-pointer flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 transition-colors ${
                        isSelected
                          ? 'bg-primary/10 text-primary font-bold dark:bg-primary/20'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex flex-col pr-2 truncate">
                        <span className="font-semibold uppercase truncate">{item.name}</span>
                        {(item.sku || item.hsn) && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                            {item.sku ? `SKU: ${item.sku} ` : ''}{item.hsn ? `HSN: ${item.hsn}` : ''}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded shrink-0 ml-auto whitespace-nowrap">
                        Stock: {qtyVal}{unitStr}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default ItemSelectDropdown;

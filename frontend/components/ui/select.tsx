import * as React from "react"
import { cn } from "@/lib/utils"

export interface SelectOption {
    value: string
    label: string
}

export interface SelectProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
    label?: string
    error?: string
    search?: boolean
    options?: SelectOption[]
    onSearch?: (query: string) => void
    value?: string
    onChange?: (e: { target: { value: string; name?: string } }) => void
    placeholder?: string
    name?: string
    disabled?: boolean
    required?: boolean
    children?: React.ReactNode
}

export const Select = React.forwardRef<HTMLDivElement, SelectProps>(
    (
        {
            className,
            label,
            error,
            search = false,
            options = [],
            onSearch,
            placeholder = "Select an option",
            value = "",
            onChange,
            name,
            disabled,
            required,
            children,
            ...props
        },
        ref
    ) => {
        const [isOpen, setIsOpen] = React.useState(false)
        const [searchQuery, setSearchQuery] = React.useState("")
        const dropdownRef = React.useRef<HTMLDivElement>(null)

        // Parse children options if no options prop provided
        const childOptions = React.useMemo(() => {
            if (options.length > 0) return []
            
            const optionElements: SelectOption[] = []
            React.Children.forEach(children, (child) => {
                if (React.isValidElement(child) && child.type === 'option') {
                    const childProps = child.props as { value: string; children?: string }
                    optionElements.push({
                        value: childProps.value,
                        label: childProps.children || childProps.value
                    })
                }
            })
            return optionElements
        }, [children, options])

        const displayOptions = options.length > 0 ? options : childOptions

        const filteredOptions = search
            ? displayOptions.filter(option =>
                option.label.toLowerCase().includes(searchQuery.toLowerCase())
            )
            : displayOptions

        React.useEffect(() => {
            const handleClickOutside = (event: MouseEvent) => {
                if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                    setIsOpen(false)
                }
            }

            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }, [])

        const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value
            setSearchQuery(value)
            onSearch?.(value)
        }

        const selectedOption = displayOptions.find(opt => opt.value === value)
        const selectedLabel = selectedOption?.label || placeholder

        const handleSelect = (optionValue: string) => {
            onChange?.({ target: { value: optionValue, name } })
            setIsOpen(false)
        }

        const selectContent = (
            <div className="relative" ref={dropdownRef}>
                <button
                    type="button"
                    className={cn(
                        "flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
                        className,
                        error && "border-red-500 focus:ring-red-500"
                    )}
                    onClick={() => !disabled && setIsOpen(!isOpen)}
                    disabled={disabled}
                >
                    <span className={cn("truncate", !value && "text-slate-400")}>
                        {selectedLabel}
                    </span>
                    <svg
                        className={cn("h-4 w-4 opacity-50", isOpen && "rotate-180")}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {isOpen && displayOptions.length > 0 && (
                    <div className="absolute z-[9999] mt-1 w-full rounded-lg border border-slate-200 bg-white text-slate-950 shadow-lg">
                        {search && (
                            <div className="relative p-2 border-b border-slate-100">
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    className="w-full bg-transparent pl-8 pr-4 py-1.5 text-sm outline-none placeholder:text-slate-400 border border-slate-200 rounded-md"
                                    value={searchQuery}
                                    onChange={handleSearchChange}
                                    autoFocus
                                />
                                <svg
                                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        )}
                        <div className="p-1 max-h-60 overflow-auto">
                            {filteredOptions.length > 0 ? (
                                filteredOptions.map((option) => (
                                    <div
                                        key={option.value}
                                        className={cn(
                                            "relative flex w-full cursor-pointer select-none items-center rounded-md py-1.5 px-3 text-sm outline-none hover:bg-slate-100 hover:text-slate-900 cursor-pointer",
                                            option.value === value && "bg-slate-100/50 text-slate-900 font-medium"
                                        )}
                                        onClick={() => handleSelect(option.value)}
                                    >
                                        <span>{option.label}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="px-3 py-2 text-sm text-slate-500">
                                    No options found
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )

        if (!label) return selectContent

        return (
            <div className="grid w-full items-center gap-1.5">
                <label className="text-sm font-medium leading-none text-slate-700">
                    {label}
                    {required && <span className="text-red-500"> *</span>}
                </label>
                {selectContent}
                {error && <p className="text-sm font-medium text-red-500">{error}</p>}
            </div>
        )
    }
)

Select.displayName = "Select"

import * as React from "react"
import { Circle, CircleCheck, ChevronDown, Search } from "lucide-react"
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
}

const Select = React.forwardRef<HTMLDivElement, SelectProps>(
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
            ...props
        },
        ref
    ) => {
        const [isOpen, setIsOpen] = React.useState(false)
        const [searchQuery, setSearchQuery] = React.useState("")
        const dropdownRef = React.useRef<HTMLDivElement>(null)

        const filteredOptions = search
            ? options.filter(option =>
                option.label.toLowerCase().includes(searchQuery.toLowerCase())
            )
            : options

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

        const selectedLabel = options.find(opt => opt.value === value)?.label || placeholder

        const selectContent = (
            <div className="relative" ref={dropdownRef}>
                <button
                    type="button"
                    className={cn(
                        "flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white/50 px-3 py-2 text-sm ring-offset-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
                        className,
                        error && "border-red-500 focus:ring-red-500"
                    )}
                    onClick={() => !disabled && setIsOpen(!isOpen)}
                    disabled={disabled}
                >
                    <span className="truncate">
                        {selectedLabel}
                    </span>
                    <ChevronDown className={cn("h-4 w-4 opacity-50", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white text-slate-950 shadow-lg animate-in fade-in-0 zoom-in-95">
                        {search && (
                            <div className="relative p-2 border-b border-slate-100">
                                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    className="w-full bg-transparent pl-10 pr-4 py-1.5 text-sm outline-none placeholder:text-slate-400"
                                    value={searchQuery}
                                    onChange={handleSearchChange}
                                    autoFocus
                                />
                            </div>
                        )}
                        <div className="p-1 max-h-60 overflow-auto">
                            {filteredOptions.length > 0 ? (
                                filteredOptions.map((option) => (
                                    <div
                                        key={option.value}
                                        className={cn(
                                            "relative flex w-full cursor-pointer select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-slate-100 hover:text-slate-900",
                                            option.value === value && "bg-slate-100/50 text-slate-900"
                                        )}
                                        onClick={() => {
                                            onChange?.({ target: { value: option.value, name } })
                                            setIsOpen(false)
                                        }}
                                    >
                                        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                            {option.value === value ?
                                                <CircleCheck className="h-4 w-4 text-cyan-600" /> :
                                                <Circle className="h-4 w-4 text-cyan-600" />}
                                        </span>
                                        <span>{option.label}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="px-2 py-1.5 text-sm text-slate-500">
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

export { Select }
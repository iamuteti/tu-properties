import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface MultiSelectOption {
    value: string
    label: string
}

export interface MultiSelectProps {
    options: MultiSelectOption[]
    value: string[]
    onChange: (value: string[]) => void
    placeholder?: string
    label?: string
    error?: string
    className?: string
    disabled?: boolean
    search?: boolean
    required?: boolean
}

export const MultiSelect = React.forwardRef<HTMLDivElement, MultiSelectProps>(
    ({ options, value, onChange, placeholder = "Select options", label, error, className, disabled, search = false, required = false }, ref) => {
        const [isOpen, setIsOpen] = React.useState(false)
        const [searchQuery, setSearchQuery] = React.useState("")
        const dropdownRef = React.useRef<HTMLDivElement>(null)

        const toggleOption = (optionValue: string) => {
            const newValue = value.includes(optionValue)
                ? value.filter(v => v !== optionValue)
                : [...value, optionValue]
            onChange(newValue)
        }

        const filteredOptions = search
            ? options.filter(option =>
                option.label.toLowerCase().includes(searchQuery.toLowerCase())
            )
            : options

        React.useEffect(() => {
            const handleClickOutside = (event: MouseEvent) => {
                if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                    setIsOpen(false)
                    setSearchQuery("")
                }
            }

            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }, [])

        const selectedLabels = options
            .filter(option => value.includes(option.value))
            .map(option => option.label)
            .join(', ')

        const content = (
            <div className="relative" ref={dropdownRef}>
                <button
                    type="button"
                    className={cn(
                        "flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
                        className,
                        error && "border-red-500 focus:ring-red-500",
                        disabled && "cursor-not-allowed opacity-50"
                    )}
                    onClick={() => !disabled && setIsOpen(!isOpen)}
                    disabled={disabled}
                >
                    <span className={cn("truncate", !selectedLabels && "text-slate-400")}>
                        {selectedLabels || placeholder}
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

                {isOpen && (
                    <div className="absolute z-[9999] mt-1 w-full rounded-lg border border-slate-200 bg-white text-slate-950 shadow-lg">
                        {search && (
                            <div className="relative p-2 border-b border-slate-100">
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    className="w-full bg-transparent pl-8 pr-4 py-1.5 text-sm outline-none placeholder:text-slate-400 border border-slate-200 rounded-md"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
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
                                        className="relative flex w-full cursor-pointer select-none items-center rounded-md py-1.5 px-3 text-sm outline-none hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                                        onClick={() => toggleOption(option.value)}
                                    >
                                        <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                                            {value.includes(option.value) && (
                                                <Check className="h-4 w-4 text-cyan-600" />
                                            )}
                                        </span>
                                        <span className="pl-6">{option.label}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="px-3 py-2 text-sm text-slate-500">
                                    {search ? "No options found" : "No options available"}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )

        if (!label) return content

        return (
            <div className="grid w-full items-center gap-1.5">
                <label className="text-sm font-medium leading-none text-slate-700">
                    {label}
                    {required && <span className="text-red-500"> *</span>}
                </label>
                {content}
                {error && <p className="text-sm font-medium text-red-500">{error}</p>}
            </div>
        )
    }
)

MultiSelect.displayName = "MultiSelect"

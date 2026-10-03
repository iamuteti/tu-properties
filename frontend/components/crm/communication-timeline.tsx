'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
    ArrowDownLeft,
    ArrowUpRight,
    CalendarClock,
    Mail,
    MessageSquare,
    Phone,
    Plus,
    StickyNote,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/simple-select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/entity-states';
import { crmApi } from '@/lib/api';
import { COMM_CHANNELS, COMM_DIRECTIONS } from '@/lib/constants';
import type { CommChannel, CommDirection, Communication } from '@/types';

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    EMAIL: Mail,
    SMS: MessageSquare,
    WHATSAPP: MessageSquare,
    CALL: Phone,
    NOTE: StickyNote,
    MEETING: CalendarClock,
};

const CHANNEL_STYLES: Record<string, string> = {
    EMAIL: 'bg-sky-100 text-sky-700',
    SMS: 'bg-emerald-100 text-emerald-700',
    WHATSAPP: 'bg-green-100 text-green-700',
    CALL: 'bg-violet-100 text-violet-700',
    NOTE: 'bg-amber-100 text-amber-700',
    MEETING: 'bg-indigo-100 text-indigo-700',
};

/**
 * Communication history for a contact (or a lead), newest first, with an
 * inline "log a call / note / meeting" form.
 *
 * Nothing is sent anywhere yet — Module 18 (Notifications) and the WhatsApp /
 * e-mail integrations own delivery. This is the record of what was said, which
 * is what a leasing or sales conversation actually needs.
 */
export function CommunicationTimeline({
    entries,
    contactId,
    leadId,
    onLogged,
    onDeleted,
    emptyHint,
}: {
    entries: Communication[];
    contactId?: string;
    leadId?: string;
    onLogged?: () => void | Promise<void>;
    onDeleted?: () => void | Promise<void>;
    emptyHint?: string;
}) {
    const [isLogging, setIsLogging] = useState(false);
    const [channel, setChannel] = useState<CommChannel>('CALL');
    const [direction, setDirection] = useState<CommDirection>('OUTBOUND');
    const [subject, setSubject] = useState('');
    const [content, setContent] = useState('');
    const [outcome, setOutcome] = useState('');
    const [isBusy, setIsBusy] = useState(false);

    const submit = async () => {
        setIsBusy(true);
        try {
            await crmApi.logCommunication({
                channel,
                direction,
                subject: subject || undefined,
                content: content || undefined,
                outcome: outcome || undefined,
                contactId,
                leadId,
            });
            toast.success('Logged');
            setSubject('');
            setContent('');
            setOutcome('');
            setIsLogging(false);
            await onLogged?.();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Could not log that.');
        } finally {
            setIsBusy(false);
        }
    };

    const remove = async (entry: Communication) => {
        if (!confirm('Delete this log entry?')) return;
        try {
            await crmApi.removeCommunication(entry.id);
            toast.success('Entry deleted');
            await onDeleted?.();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Could not delete that entry.');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setIsLogging((v) => !v)}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Log a communication
                </Button>
            </div>

            {isLogging && (
                <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                            <label htmlFor="comm-channel" className="mb-1 block text-xs font-medium">
                                Channel
                            </label>
                            <Select
                                id="comm-channel"
                                value={channel}
                                onChange={(e) => setChannel(e.target.value as CommChannel)}
                            >
                                {COMM_CHANNELS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </Select>
                        </div>
                        <div>
                            <label htmlFor="comm-direction" className="mb-1 block text-xs font-medium">
                                Direction
                            </label>
                            <Select
                                id="comm-direction"
                                value={direction}
                                onChange={(e) => setDirection(e.target.value as CommDirection)}
                            >
                                {COMM_DIRECTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </Select>
                        </div>
                        <div>
                            <label htmlFor="comm-subject" className="mb-1 block text-xs font-medium">
                                Subject
                            </label>
                            <Input
                                id="comm-subject"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="e.g. Confirmed Saturday viewing"
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="comm-content" className="mb-1 block text-xs font-medium">
                            What was said
                        </label>
                        <Textarea
                            id="comm-content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="min-h-[80px]"
                        />
                    </div>
                    {channel === 'CALL' && (
                        <div>
                            <label htmlFor="comm-outcome" className="mb-1 block text-xs font-medium">
                                Outcome
                            </label>
                            <Input
                                id="comm-outcome"
                                value={outcome}
                                onChange={(e) => setOutcome(e.target.value)}
                                placeholder="answered, no answer, rescheduled to Friday…"
                            />
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setIsLogging(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" onClick={submit} disabled={isBusy}>
                            {isBusy ? 'Saving…' : 'Log it'}
                        </Button>
                    </div>
                </div>
            )}

            {entries.length === 0 ? (
                <EmptyState
                    title="No communication logged yet"
                    description={
                        emptyHint ??
                        'Calls, emails, WhatsApp messages, meetings and notes appear here newest first.'
                    }
                    icon={<MessageSquare className="h-10 w-10" aria-hidden="true" />}
                />
            ) : (
                <ol className="space-y-3">
                    {entries.map((entry) => {
                        const Icon = CHANNEL_ICONS[entry.channel] ?? MessageSquare;
                        return (
                            <li key={entry.id} className="flex gap-3 rounded-lg border p-3">
                                <span
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                        CHANNEL_STYLES[entry.channel] ?? 'bg-slate-100 text-slate-700'
                                    }`}
                                >
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2 text-sm">
                                        <span className="font-medium">
                                            {entry.subject || entry.channel.charAt(0) + entry.channel.slice(1).toLowerCase()}
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                            {entry.direction === 'INBOUND' ? (
                                                <ArrowDownLeft className="h-3 w-3" aria-hidden="true" />
                                            ) : (
                                                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                                            )}
                                            {entry.direction === 'INBOUND' ? 'Inbound' : 'Outbound'}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(entry.occurredAt).toLocaleString()}
                                        </span>
                                        {entry.loggedBy && (
                                            <span className="text-xs text-muted-foreground">
                                                · logged by {entry.loggedBy.firstName}{' '}
                                                {entry.loggedBy.lastName}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => remove(entry)}
                                            className="ml-auto rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                            aria-label="Delete log entry"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                        </button>
                                    </div>
                                    {entry.content && (
                                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                                            {entry.content}
                                        </p>
                                    )}
                                    {entry.outcome && (
                                        <p className="mt-1 text-xs font-medium text-slate-600">
                                            Outcome: {entry.outcome}
                                        </p>
                                    )}
                                    {entry.lead && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Logged against lead {entry.lead.firstName}{' '}
                                            {entry.lead.lastName ?? ''} before conversion
                                        </p>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}
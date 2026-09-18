import { useState } from 'react';
import { useApp } from '../../../contexts/AppContext';
import { useI18n } from '../../../shared/i18n';
import { setN8nWebhookUrl, getN8nWebhookUrl } from '../n8n';
import { Button, Badge, Input } from '../../../shared/components';
import {
  MessageSquare,
  MessageCircle,
  Bell,
  CheckCheck,
  Trash2,
  Settings2,
  ChevronDown,
  FileDown,
  Mail,
  Phone,
  Globe,
} from 'lucide-react';
import { cn } from '../../../shared/utils/cn';
import { formatDateTime } from '../../../shared/utils/formatters';

/**
 * The phone-side view: every SMS/WhatsApp the applicant "received", newest
 * first, with the channel, language and timestamp shown so a judge can verify
 * the multilingual delivery claim at a glance. Includes the demo controls for
 * the recipient number, delivery language and the optional n8n webhook.
 */
export function NotificationFeed() {
  const { state, actions } = useApp();
  const { dict, format, language, setLanguage } = useI18n();
  const [showSettings, setShowSettings] = useState(false);
  const [webhook, setWebhook] = useState(getN8nWebhookUrl());
  const [saved, setSaved] = useState(false);
  const { notifications, phone, journeyType } = state;

  const sorted = [...notifications].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());

  const saveWebhook = () => {
    setN8nWebhookUrl(webhook.trim());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning-100">
            <Bell className="h-5 w-5 text-warning-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-surface-900">{dict.notifications.title}</h3>
            <p className="truncate text-xs text-surface-500">
              {format(dict.notifications.subtitle, { phone: phone ?? '9876543210' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(current => !current)}
            aria-expanded={showSettings}
            aria-label="Delivery settings"
            className="px-2"
          >
            <Settings2 className="h-4 w-4" />
            <ChevronDown className={cn('h-3 w-3 transition-transform', showSettings && 'rotate-180')} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={actions.markNotificationsRead}
            aria-label={dict.notifications.markAllRead}
            className="px-2"
          >
            <CheckCheck className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={actions.clearNotifications}
            aria-label={dict.notifications.clear}
            className="px-2"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Delivery settings */}
      {showSettings && (
        <div className="space-y-3 border-b border-surface-200 bg-surface-50 px-4 py-3">
          <Input
            label={dict.login.phoneLabel}
            value={phone ?? ''}
            onChange={event => actions.setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
            inputMode="numeric"
            placeholder="10-digit number"
            leftIcon={<Phone className="h-4 w-4" />}
          />
          <div>
            <p className="mb-1.5 text-sm font-medium text-surface-700">
              <span className="mb-1.5 flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-surface-400" />
                Message language
              </span>
            </p>
            <div className="flex gap-1.5">
              {(['en', 'hi', 'kn'] as const).map(code => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLanguage(code)}
                  className={cn(
                    'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                    language === code
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-surface-300 bg-white text-surface-600 hover:bg-surface-100'
                  )}
                >
                  {dict.language[code]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-surface-400">
              Applies to the next milestone message — existing ones keep the language they were sent in.
            </p>
          </div>
          <div>
            <Input
              label="n8n webhook URL (optional)"
              value={webhook}
              onChange={event => setWebhook(event.target.value)}
              placeholder="https://your-n8n.app/webhook/paytm-clarity"
              leftIcon={<Settings2 className="h-4 w-4" />}
            />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={saveWebhook}>
                {saved ? 'Saved ✓' : 'Save webhook'}
              </Button>
              <span className="text-[11px] text-surface-400">
                Milestones mirror to n8n for Slack/Sheets/CRM automations.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {sorted.length === 0 && <p className="py-8 text-center text-sm text-surface-400">{dict.notifications.empty}</p>}

        {sorted.map(notification => (
          <div
            key={notification.id}
            className={cn(
              'rounded-xl border p-3',
              notification.read ? 'border-surface-200 bg-white' : 'border-primary-200 bg-primary-50/60'
            )}
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {notification.channels !== 'sms' && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-semibold text-success-700"
                  title="WhatsApp Business API"
                >
                  <MessageCircle className="h-3 w-3" />
                  {dict.notifications.viaWhatsapp}
                </span>
              )}
              {notification.channels !== 'whatsapp' && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700"
                  title="SMS gateway"
                >
                  <MessageSquare className="h-3 w-3" />
                  {dict.notifications.viaSms}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-medium text-surface-600">
                <Globe className="h-3 w-3" />
                {dict.language[notification.language]}
              </span>
              <span className="ml-auto text-[10px] text-surface-400">{formatDateTime(notification.sentAt)}</span>
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-surface-500">{notification.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-surface-700">{notification.body}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-surface-400">
                {format(dict.notifications.to, { phone: notification.phone })}
              </span>
              {!notification.read && <Badge variant="info" size="sm">new</Badge>}
            </div>
          </div>
        ))}
      </div>

      {/* Footer: PDF + journey hint */}
      <div className="border-t border-surface-200 p-3">
        {journeyType && (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => {
              document.getElementById('pdf-download-btn')?.click();
            }}
          >
            <FileDown className="h-4 w-4" />
            {dict.statement.downloadPdf}
          </Button>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-surface-400">
          <Mail className="h-3 w-3" />
          Simulated delivery — in production this hits an SMS gateway + WhatsApp Business API via n8n.
        </p>
      </div>
    </div>
  );
}

import { FolderOpen } from 'lucide-react'
import type { ToolField } from '@shared/types/domain'
import { Checkbox, Field, Input, Select, Textarea } from '../ui/Field'
import { IconButton } from '../ui/Button'
import { api } from '../../lib/ipc'

export type ToolPayload = Record<string, unknown>

/** 依据 manifest 生成初始表单值，select 自动选中首项，checkbox 默认 false */
export function initialPayload(fields: ToolField[]): ToolPayload {
  const payload: ToolPayload = {}
  for (const field of fields) {
    if (field.defaultValue !== undefined && field.defaultValue !== null) {
      payload[field.name] = field.defaultValue
      continue
    }
    if (field.type === 'checkbox') {
      payload[field.name] = false
      continue
    }
    if (field.type === 'select') {
      payload[field.name] = field.options?.[0]?.value ?? ''
      continue
    }
    payload[field.name] = ''
  }
  return payload
}

/** 前端必填校验，返回「字段名 → 错误文案」 */
export function validatePayload(fields: ToolField[], payload: ToolPayload): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of fields) {
    if (!field.required) continue
    const value = payload[field.name]
    if (field.type === 'checkbox') {
      if (value !== true) errors[field.name] = '请勾选该项'
      continue
    }
    if (value === undefined || value === null || String(value).trim() === '') {
      errors[field.name] = '该项为必填'
    }
  }
  return errors
}

/** 按 visibleWhen 过滤出当前该填的字段（多模式计算器共用一张表单） */
export function visibleFields(fields: ToolField[], payload: ToolPayload): ToolField[] {
  return fields.filter((field) => {
    if (!field.visibleWhen) return true
    const current = payload[field.visibleWhen.key]
    if (current === undefined || current === null || String(current) === '') return true
    return field.visibleWhen.values.includes(String(current))
  })
}

export interface ToolRunnerFormProps {
  fields: ToolField[]
  value: ToolPayload
  errors: Record<string, string>
  disabled?: boolean
  onChange: (name: string, value: unknown) => void
}

export function ToolRunnerForm({ fields, value, errors, disabled, onChange }: ToolRunnerFormProps): JSX.Element {
  const pick = async (field: ToolField): Promise<void> => {
    const picked = await api.app.pickPath(field.pathKind ?? 'file')
    if (picked) onChange(field.name, picked)
  }

  return (
    <div className="grid gap-4">
      {visibleFields(fields, value).map((field) => {
        const current = value[field.name]
        const error = errors[field.name]

        if (field.type === 'checkbox') {
          return (
            <Field key={field.name} error={error} hint={field.hint}>
              <Checkbox
                label={field.label}
                checked={current === true}
                disabled={disabled}
                onChange={(event) => onChange(field.name, event.target.checked)}
              />
            </Field>
          )
        }

        if (field.type === 'select') {
          return (
            <Field key={field.name} label={field.label} required={field.required} hint={field.hint} error={error}>
              <Select
                value={String(current ?? '')}
                disabled={disabled}
                onChange={(event) => onChange(field.name, event.target.value)}
              >
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          )
        }

        if (field.type === 'textarea') {
          return (
            <Field key={field.name} label={field.label} required={field.required} hint={field.hint} error={error}>
              <Textarea
                value={String(current ?? '')}
                placeholder={field.placeholder}
                disabled={disabled}
                onChange={(event) => onChange(field.name, event.target.value)}
              />
            </Field>
          )
        }

        if (field.type === 'path') {
          return (
            <Field key={field.name} label={field.label} required={field.required} hint={field.hint} error={error}>
              <div className="flex items-center gap-2">
                <Input
                  value={String(current ?? '')}
                  placeholder={field.placeholder}
                  disabled={disabled}
                  onChange={(event) => onChange(field.name, event.target.value)}
                />
                <IconButton
                  label={field.pathKind === 'directory' ? '选择目录' : '选择文件'}
                  disabled={disabled}
                  onClick={() => void pick(field)}
                >
                  <FolderOpen className="h-4 w-4" />
                </IconButton>
              </div>
            </Field>
          )
        }

        return (
          <Field key={field.name} label={field.label} required={field.required} hint={field.hint} error={error}>
            <Input
              type={field.type === 'number' ? 'number' : 'text'}
              value={String(current ?? '')}
              placeholder={field.placeholder}
              disabled={disabled}
              onChange={(event) =>
                onChange(field.name, field.type === 'number' ? event.target.valueAsNumber : event.target.value)
              }
            />
          </Field>
        )
      })}
    </div>
  )
}

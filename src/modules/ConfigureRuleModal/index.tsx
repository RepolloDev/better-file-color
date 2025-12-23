import React, { useState, useEffect } from 'react'
import { Modal } from 'obsidian'
import { createRoot, Root } from 'react-dom/client'
import type { FileColorPluginSettings } from 'settings'
import { nanoid } from 'nanoid'

type Group = FileColorPluginSettings['groups'][number]
type Condition = Group['conditions'][number]
type Palette = FileColorPluginSettings['palette']

interface ConfigureRuleModalProps {
  group: Group
  palette: Palette
  plugin: any
  currentGroups: Group[]
  onSave: (group: Group) => void
}

export class ConfigureRuleModal extends Modal {
  group: Group
  palette: Palette
  plugin: any
  currentGroups: Group[]
  onSave: (group: Group) => void
  root?: Root

  constructor(app: any, group: Group, palette: Palette, plugin: any, currentGroups: Group[], onSave: (group: Group) => void) {
    super(app)
    this.group = group
    this.palette = palette
    this.plugin = plugin
    this.currentGroups = currentGroups
    this.onSave = onSave
  }

  onOpen(): void {
    this.titleEl.innerText = 'Configure Group'
    this.root = createRoot(this.contentEl)
    this.root.render(
      <ConfigureRuleContent
        group={this.group}
        palette={this.palette}
        plugin={this.plugin}
        currentGroups={this.currentGroups}
        onSave={(updatedGroup) => {
          this.onSave(updatedGroup)
          this.close()
        }}
        onCancel={() => this.close()}
      />
    )
  }

  onClose(): void {
    this.root?.unmount()
  }
}

const ConfigureRuleContent: React.FC<{
  group: Group
  palette: Palette
  plugin: any
  currentGroups: Group[]
  onSave: (group: Group) => void
  onCancel: () => void
}> = ({ group, palette, plugin, currentGroups, onSave, onCancel}) => {
  const [name, setName] = useState(group.name)
  const [colorId, setColorId] = useState(group.colorId)
  const [usePropertyAsColor, setUsePropertyAsColor] = useState(group.usePropertyAsColor)
  const [propertyNameForColor, setPropertyNameForColor] = useState(group.propertyNameForColor)
  const [conditions, setConditions] = useState<Condition[]>(group.conditions)
  const [expandedConditions, setExpandedConditions] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [nameError, setNameError] = useState('')

  // Aplicar preview automáticamente cuando cambien las condiciones
  useEffect(() => {
    const previewGroup = {
      ...group,
      name,
      colorId,
      usePropertyAsColor,
      propertyNameForColor,
      conditions,
      enabled: true,
      priority: 9999 // Prioridad alta para que se aplique primero en preview
    }
    
    // Guardar settings originales y aplicar preview temporal
    const originalGroups = plugin.settings.groups
    plugin.settings.groups = [previewGroup, ...originalGroups.filter((g: any) => g.id !== group.id)]
    plugin.applyColorStyles()
    
    // Cleanup: restaurar al desmontar o cambiar
    return () => {
      plugin.settings.groups = originalGroups
      plugin.applyColorStyles()
    }
  }, [conditions, colorId, usePropertyAsColor, propertyNameForColor, name])

  const toggleCondition = (conditionId: string) => {
    const newExpanded = new Set(expandedConditions)
    if (newExpanded.has(conditionId)) {
      newExpanded.delete(conditionId)
    } else {
      newExpanded.add(conditionId)
    }
    setExpandedConditions(newExpanded)
  }

  const getConditionSummary = (condition: Condition): string => {
    if (condition.type === 'regex') {
      const target = condition.matchFullPath ? 'full path' : 'filename'
      const pattern = condition.pattern || '(empty)'
      return `${target}: ${pattern.length > 30 ? pattern.substring(0, 30) + '...' : pattern}`
    } else {
      const op = condition.propertyOperator
      const prop = condition.propertyName || '(empty)'
      if (op === 'exists') {
        return `${prop} exists`
      }
      const value = condition.propertyValue || '(empty)'
      return `${prop} ${op} ${value.length > 20 ? value.substring(0, 20) + '...' : value}`
    }
  }

  const onAddCondition = (type: 'regex' | 'property') => {
    const newCondition: Condition = {
      id: nanoid(),
      type,
      pattern: '',
      matchFullPath: false,
      propertyName: '',
      propertyValue: '',
      propertyOperator: 'equals',
    }
    setConditions([newCondition, ...conditions])
    setExpandedConditions(new Set([...expandedConditions, newCondition.id]))
  }

  const onRemoveCondition = (conditionId: string) => {
    setConditions(conditions.filter(c => c.id !== conditionId))
    const newExpanded = new Set(expandedConditions)
    newExpanded.delete(conditionId)
    setExpandedConditions(newExpanded)
  }

  const onUpdateCondition = (conditionId: string, updates: Partial<Condition>) => {
    setConditions(conditions.map(c => 
      c.id === conditionId ? { ...c, ...updates } : c
    ))
  }

  const validateCondition = (condition: Condition): boolean => {
    if (condition.type === 'regex') {
      if (!condition.pattern) {
        setError('Regex pattern is required')
        return false
      }
      try {
        new RegExp(condition.pattern)
      } catch (e) {
        setError(`Invalid regex pattern: ${condition.pattern}`)
        return false
      }
    } else if (condition.type === 'property') {
      if (!condition.propertyName) {
        setError('Property name is required')
        return false
      }
      if (condition.propertyOperator !== 'exists' && !condition.propertyValue) {
        setError('Property value is required')
        return false
      }
    }
    return true
  }

  const handleSave = () => {
    setError('')
    setNameError('')
    
    // Validar nombre del grupo
    if (!name.trim()) {
      setNameError('Group name is required')
      setError('Group name is required')
      return
    }

    // Validar que no haya otro grupo con el mismo nombre
    const existingGroups = currentGroups
    console.log('Validating against existing groups:', existingGroups.map((g: any) => ({ id: g.id, name: g.name })))
    console.log('Current group id:', group.id, 'Current name:', name.trim())
    
    const duplicateGroup = existingGroups.find((g: any) => {
      const isDifferentGroup = g.id !== group.id
      const hasSameName = g.name && g.name.toLowerCase().trim() === name.toLowerCase().trim()
      console.log(`Checking group ${g.id} (${g.name}): isDifferent=${isDifferentGroup}, sameName=${hasSameName}`)
      return isDifferentGroup && hasSameName
    })
    
    if (duplicateGroup) {
      const errorMsg = `A group with the name "${name.trim()}" already exists`
      console.log('Duplicate found:', duplicateGroup)
      setNameError(errorMsg)
      setError(errorMsg)
      return
    }
    
    console.log('No duplicate found, proceeding to save')
    
    // Validar todas las condiciones
    for (const condition of conditions) {
      if (!validateCondition(condition)) {
        return
      }
    }

    // Validar color
    if (usePropertyAsColor) {
      if (!propertyNameForColor) {
        setError('Property name for color is required')
        return
      }
    }
    
    const savedGroup = {
      ...group,
      name: name.trim(),
      colorId,
      usePropertyAsColor,
      propertyNameForColor,
      conditions,
    }
    
    console.log('Saving group:', savedGroup)
    onSave(savedGroup)
  }

  return (
    <div style={{ padding: '20px' }}>
      {/* Group Name */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
          Group Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setNameError('')
            setError('')
          }}
          placeholder="Enter group name"
          style={{ 
            width: '100%', 
            padding: '8px',
            borderColor: nameError ? 'var(--text-error)' : undefined,
            borderWidth: nameError ? '2px' : undefined
          }}
        />
        {nameError && (
          <small style={{ color: 'var(--text-error)', display: 'block', marginTop: '4px' }}>
            {nameError}
          </small>
        )}
      </div>

      {/* Use Property as Color */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={usePropertyAsColor}
            onChange={(e) => setUsePropertyAsColor(e.target.checked)}
          />
          <span>Use property value as color (hex)</span>
        </label>
        {usePropertyAsColor && (
          <input
            type="text"
            value={propertyNameForColor}
            onChange={(e) => setPropertyNameForColor(e.target.value)}
            placeholder="Property name for color"
            style={{ width: '100%', padding: '8px', marginTop: '8px', fontFamily: 'var(--font-monospace)' }}
          />
        )}
        <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
          If enabled, the property value must be a hex color (e.g., #FF5733)
        </small>
      </div>

      {/* Color Selection */}
      {!usePropertyAsColor && (
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
            Color
          </label>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', 
            gap: '12px',
            padding: '12px',
            border: '1px solid var(--background-modifier-border)',
            borderRadius: '4px'
          }}>
            {palette.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-muted)', padding: '12px' }}>
                No colors available
              </div>
            )}
            {palette.map((color) => (
              <div
                key={color.id}
                onClick={() => setColorId(color.id)}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
                title={color.name || color.value}
              >
                <div
                  style={{
                    width: '100%',
                    height: '50px',
                    backgroundColor: color.value,
                    borderRadius: '4px',
                    border: colorId === color.id ? '3px solid var(--interactive-accent)' : '2px solid var(--background-modifier-border)',
                    boxSizing: 'border-box',
                    transition: 'all 0.15s ease'
                  }}
                />
                <div
                  style={{
                    fontSize: '12px',
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--text-muted)'
                  }}
                >
                  {color.name || color.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conditions Section */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
          Conditions (All must match)
        </label>
        <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '12px' }}>
          Add multiple conditions that must all be true for this group to apply
        </small>

        {conditions.map((condition, index) => {
          const isExpanded = expandedConditions.has(condition.id)
          const conditionNumber = conditions.length - index
          return (
            <div
              key={condition.id}
              style={{
                border: '1px solid var(--background-modifier-border)',
                borderRadius: '4px',
                marginBottom: '8px',
              }}
            >
              {/* Condition Header */}
              <div 
                onClick={() => toggleCondition(condition.id)}
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '12px',
                  cursor: 'pointer',
                  backgroundColor: isExpanded ? 'transparent' : 'var(--background-secondary)',
                  borderRadius: '4px'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <strong>Condition {conditionNumber}</strong>
                    <span style={{ 
                      fontSize: '11px', 
                      padding: '2px 6px', 
                      backgroundColor: 'var(--background-modifier-border)',
                      borderRadius: '3px',
                      color: 'var(--text-muted)'
                    }}>
                      {condition.type === 'regex' ? 'Regex' : 'Property'}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </div>
                  {!isExpanded && (
                    <div style={{ 
                      fontSize: '12px', 
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {getConditionSummary(condition)}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveCondition(condition.id)
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    color: 'var(--text-error)',
                  }}
                >
                  Remove
                </button>
              </div>

              {/* Condition Content */}
              {isExpanded && (
                <div style={{ padding: '0 12px 12px 12px' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Type</label>
                    <select
                      value={condition.type}
                      onChange={(e) => onUpdateCondition(condition.id, { type: e.target.value as 'regex' | 'property' })}
                      style={{ width: '100%', padding: '6px' }}
                    >
                      <option value="regex">Filename regex</option>
                      <option value="property">Frontmatter property</option>
                    </select>
                  </div>

                  {condition.type === 'regex' && (
                    <>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                          <input
                            type="checkbox"
                            checked={condition.matchFullPath}
                            onChange={(e) => onUpdateCondition(condition.id, { matchFullPath: e.target.checked })}
                          />
                          <span>Match full path (instead of just filename)</span>
                        </label>
                        <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '4px', marginLeft: '22px' }}>
                          When enabled, regex applies to full path (e.g., "folder/file.md"). When disabled, only to filename (e.g., "file.md")
                        </small>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Pattern</label>
                        <input
                          type="text"
                          value={condition.pattern}
                          onChange={(e) => onUpdateCondition(condition.id, { pattern: e.target.value })}
                          placeholder={condition.matchFullPath ? "e.g., ^notes/.*\\.md$" : "e.g., \\.md$"}
                          style={{ width: '100%', padding: '6px', fontFamily: 'var(--font-monospace)' }}
                        />
                      </div>
                    </>
                  )}

                  {condition.type === 'property' && (
                    <>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Property Name</label>
                        <input
                          type="text"
                          value={condition.propertyName}
                          onChange={(e) => onUpdateCondition(condition.id, { propertyName: e.target.value })}
                          placeholder="e.g., tags, status"
                          style={{ width: '100%', padding: '6px', fontFamily: 'var(--font-monospace)' }}
                        />
                      </div>

                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Operator</label>
                        <select
                          value={condition.propertyOperator}
                          onChange={(e) => onUpdateCondition(condition.id, { propertyOperator: e.target.value as any })}
                          style={{ width: '100%', padding: '6px' }}
                        >
                          <option value="exists">Exists</option>
                          <option value="equals">Equals</option>
                          <option value="contains">Contains</option>
                        </select>
                      </div>

                      {condition.propertyOperator !== 'exists' && (
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Property Value</label>
                          <input
                            type="text"
                            value={condition.propertyValue}
                            onChange={(e) => onUpdateCondition(condition.id, { propertyValue: e.target.value })}
                            placeholder="Value to match"
                            style={{ width: '100%', padding: '6px' }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            onClick={() => onAddCondition('regex')}
            style={{ flex: 1, padding: '8px', fontSize: '13px' }}
          >
            + Regex Condition
          </button>
          <button
            onClick={() => onAddCondition('property')}
            style={{ flex: 1, padding: '8px', fontSize: '13px' }}
          >
            + Property Condition
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--text-error)', marginBottom: '16px', padding: '8px', backgroundColor: 'var(--background-secondary)', borderRadius: '4px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '8px 16px' }}>
          Cancel
        </button>
        <button
          onClick={handleSave}
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--interactive-accent)',
            color: 'var(--text-on-accent)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Save
        </button>
      </div>
    </div>
  )
}

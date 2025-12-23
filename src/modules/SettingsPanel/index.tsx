import { Button } from 'components/Button'
import { AddCircleIcon } from 'components/icons/AddCircleIcon'
import { TrashIcon } from 'components/icons/TrashIcon'
import { SettingsIcon } from 'components/icons/SettingsIcon'
import { usePlugin } from 'hooks/usePlugin'
import { nanoid } from 'nanoid'
import React, { useEffect, useState } from 'react'
import type { FileColorPluginSettings } from 'settings'
import {
  SettingItem,
  SettingItemName,
  SettingItemControl,
  SettingItemInfo,
  SettingItemDescription
} from 'components/SettingItem'
import { SettingItemControlFull } from './SettingItemControlFull'
import { WideTextInput } from './WideTextInput'
import { Notice } from 'obsidian'
import { ConfigureRuleModal } from 'modules/ConfigureRuleModal'

type Color = FileColorPluginSettings['palette'][number]
type Group = FileColorPluginSettings['groups'][number]

export const SettingsPanel = () => {
  const plugin = usePlugin()
  const [palette, setPalette] = useState<FileColorPluginSettings['palette']>(
    plugin.settings.palette
  )
  const [groups, setGroups] = useState<FileColorPluginSettings['groups']>(
    plugin.settings.groups
  )
  const [cascadeColors, setCascadeColors] = useState<FileColorPluginSettings['cascadeColors']>(
    plugin.settings.cascadeColors
  )
  const [colorBackground, setColorBackground] = useState<FileColorPluginSettings['colorBackground']>(
    plugin.settings.colorBackground
  )
  const [folderNotesCompatibility, setFolderNotesCompatibility] = useState<FileColorPluginSettings['folderNotesCompatibility']>(
    plugin.settings.folderNotesCompatibility
  )
  const [changed, setChanged] = useState<boolean>(false)
  const [colorErrorQueue, setColorErrorQueue] = useState<Array<{ colorIds: string[], message: string, errorType: string }>>([])
  const [activeError, setActiveError] = useState<{ colorIds: string[], message: string, errorType: string } | null>(null)

  useEffect(() => {
    if (palette.length !== plugin.settings.palette.length) {
      setChanged(true)
      return
    }

    setChanged(
      palette.some((color) => {
        const settingsColor = plugin.settings.palette.find(
          (settingsColor) => settingsColor.id === color.id
        )

        if (
          !settingsColor ||
          settingsColor.name !== color.name ||
          settingsColor.value !== color.value
        ) {
          return true
        }
      })
    )
  }, [plugin, palette])

  const onRemoveColor = (color: Color, colorIndex: number) => {
    setPalette(palette.filter((paletteColor) => paletteColor.id !== color.id))
  }

  const validateAndNormalizeHex = (hex: string): string | null => {
    hex = hex.trim()
    // Remove # if present
    if (hex.startsWith('#')) {
      hex = hex.substring(1)
    }
    // Validate hex format (3 or 6 characters)
    if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
      return '#' + hex.toUpperCase()
    }
    if (/^[0-9A-Fa-f]{3}$/.test(hex)) {
      // Expand 3-digit hex to 6-digit
      return '#' + hex.split('').map(c => c + c).join('').toUpperCase()
    }
    return null
  }

  const onColorValueChange = (color: Color, value: string) => {
    // Si este color tiene el error activo de hex inválido
    if (activeError && activeError.colorIds.includes(color.id) && activeError.errorType === 'invalid-hex') {
      // Remover este error de la cola
      const remainingErrors = colorErrorQueue.filter(e => !e.colorIds.includes(color.id))
      setColorErrorQueue(remainingErrors)
      setActiveError(remainingErrors.length > 0 ? remainingErrors[0] : null)
    }
    
    setPalette(
      palette.map((paletteColor) => {
        if (paletteColor.id === color.id) {
          return { ...color, value }
        }
        return paletteColor
      })
    )
  }

  const onColorHexInputChange = (color: Color, hexValue: string) => {
    const normalized = validateAndNormalizeHex(hexValue)
    if (normalized) {
      onColorValueChange(color, normalized)
    }
  }

  const onColorNameChange = (color: Color, name: string) => {
    // Si este color está en el error activo y el usuario lo está corrigiendo
    if (activeError && activeError.colorIds.includes(color.id)) {
      // Remover este error de la cola y avanzar al siguiente
      const remainingErrors = colorErrorQueue.filter(e => !e.colorIds.includes(color.id))
      setColorErrorQueue(remainingErrors)
      setActiveError(remainingErrors.length > 0 ? remainingErrors[0] : null)
    }
    
    setPalette(
      palette.map((paletteColor) => {
        if (paletteColor.id === color.id) {
          return { ...color, name }
        }
        return paletteColor
      })
    )
  }

  const onAddColor = () => {
    setPalette([
      ...palette,
      {
        id: nanoid(),
        name: '',
        value: '#ffffff',
      },
    ])
  }

  const onSave = () => {
    // Limpiar errores previos
    setColorErrorQueue([])
    setActiveError(null)
    
    const errors: Array<{ colorIds: string[], message: string, errorType: string }> = []
    
    // Validación 1: Valores hex inválidos
    palette.forEach(color => {
      const hex = color.value.trim()
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        errors.push({
          colorIds: [color.id],
          message: `Invalid hex color: ${hex}`,
          errorType: 'invalid-hex'
        })
      }
    })
    
    // Validación 2: Nombres duplicados (solo si no están vacíos)
    const nameToColors: { [key: string]: Color[] } = {}
    palette.forEach(color => {
      const name = color.name.trim().toLowerCase()
      if (name) {
        if (!nameToColors[name]) {
          nameToColors[name] = []
        }
        nameToColors[name].push(color)
      }
    })
    
    Object.entries(nameToColors).forEach(([name, colors]) => {
      if (colors.length > 1) {
        // Agrupar todos los colores con el mismo nombre en un solo error
        errors.push({
          colorIds: colors.map(c => c.id),
          message: `Duplicate color name "${colors[0].name.trim()}" (${colors.length} colors)`,
          errorType: 'duplicate-name'
        })
      }
    })
    
    if (errors.length > 0) {
      setColorErrorQueue(errors)
      setActiveError(errors[0])
      return
    }

    plugin.settings.palette = palette
    plugin.settings.fileColors = plugin.settings.fileColors.filter(
      (fileColor) => palette.find((color) => fileColor.color === color.id)
    )
    plugin.saveSettings()
    plugin.generateColorStyles()
    plugin.applyColorStyles()
    setChanged(false)
  }

  const onRevert = () => {
    setPalette(plugin.settings.palette)
    setChanged(false)
  }

  const onChangeCascadeColors = () => {
    setCascadeColors(!cascadeColors)
    plugin.settings.cascadeColors = !plugin.settings.cascadeColors
    plugin.saveSettings()
    plugin.applyColorStyles()
  }

  const onChangeColorBackground = () => {
    setColorBackground(!colorBackground)
    plugin.settings.colorBackground = !plugin.settings.colorBackground
    plugin.saveSettings()
    plugin.applyColorStyles()
  }

  const onChangeFolderNotesCompatibility = () => {
    setFolderNotesCompatibility(!folderNotesCompatibility)
    plugin.settings.folderNotesCompatibility = !plugin.settings.folderNotesCompatibility
    plugin.saveSettings()
    plugin.applyColorStyles()
  }

  const onAddGroup = () => {
    const newGroup: Group = {
      id: nanoid(),
      name: 'New Group',
      colorId: palette.length > 0 ? palette[0].id : '',
      usePropertyAsColor: false,
      propertyNameForColor: '',
      enabled: true,
      priority: groups.length > 0 ? Math.min(...groups.map(g => g.priority)) - 1 : 0,
      conditions: [],
    }
    // Abrir modal directamente sin agregar el grupo todavía
    onConfigureGroup(newGroup.id, newGroup)
  }

  const onRemoveGroup = (groupId: string) => {
    const updatedGroups = groups.filter((group) => group.id !== groupId)
    setGroups(updatedGroups)
    // Guardar inmediatamente
    plugin.settings.groups = updatedGroups
    plugin.saveSettings(true)
    plugin.applyColorStyles()
  }

  const onConfigureGroup = (groupId: string, newGroup?: Group) => {
    const group = newGroup || groups.find((g) => g.id === groupId)
    if (!group) return

    const isNewGroup = !!newGroup

    const modal = new ConfigureRuleModal(
      plugin.app,
      group,
      palette,
      plugin,
      groups, // Pasar los grupos actuales para validación
      (updatedGroup) => {
        let updatedGroups: Group[]
        if (isNewGroup) {
          // Agregar el nuevo grupo
          updatedGroups = [...groups, updatedGroup]
        } else {
          // Actualizar grupo existente
          updatedGroups = groups.map((g) => (g.id === groupId ? updatedGroup : g))
        }
        console.log('Saving groups to settings:', updatedGroups)
        setGroups(updatedGroups)
        // Guardar inmediatamente
        plugin.settings.groups = updatedGroups
        plugin.saveSettings(true)
        plugin.applyColorStyles()
        new Notice(isNewGroup ? 'Group created successfully!' : 'Group updated successfully!')
      }
    )
    modal.open()
  }

  const onGroupToggle = (groupId: string) => {
    const updatedGroups = groups.map((group) =>
      group.id === groupId ? { ...group, enabled: !group.enabled } : group
    )
    setGroups(updatedGroups)
    // Guardar inmediatamente
    plugin.settings.groups = updatedGroups
    plugin.saveSettings(true)
    plugin.applyColorStyles()
  }

  const onGroupMoveUp = (groupId: string) => {
    const sortedGroups = [...groups].sort((a, b) => b.priority - a.priority)
    const index = sortedGroups.findIndex(g => g.id === groupId)
    if (index > 0) {
      const currentPriority = sortedGroups[index].priority
      const higherPriority = sortedGroups[index - 1].priority
      const updatedGroups = groups.map((group) => {
        if (group.id === groupId) return { ...group, priority: higherPriority + 1 }
        if (group.id === sortedGroups[index - 1].id) return { ...group, priority: currentPriority }
        return group
      })
      setGroups(updatedGroups)
      // Guardar inmediatamente
      plugin.settings.groups = updatedGroups
      plugin.saveSettings(true)
      plugin.applyColorStyles()
    }
  }

  const onGroupMoveDown = (groupId: string) => {
    const sortedGroups = [...groups].sort((a, b) => b.priority - a.priority)
    const index = sortedGroups.findIndex(g => g.id === groupId)
    if (index < sortedGroups.length - 1) {
      const currentPriority = sortedGroups[index].priority
      const lowerPriority = sortedGroups[index + 1].priority
      const updatedGroups = groups.map((group) => {
        if (group.id === groupId) return { ...group, priority: lowerPriority - 1 }
        if (group.id === sortedGroups[index + 1].id) return { ...group, priority: currentPriority }
        return group
      })
      setGroups(updatedGroups)
      // Guardar inmediatamente
      plugin.settings.groups = updatedGroups
      plugin.saveSettings(true)
      plugin.applyColorStyles()
    }
  }

  return (
    <div className="file-color-settings-panel">
      <h2>Palette</h2>
      {palette.length < 1 && <span>No colors in the palette</span>}
      {palette.map((color, colorIndex) => (
        <SettingItem key={color.id}>
          <SettingItemControlFull>
            <input
              type="color"
              value={color.value}
              onChange={(e) => onColorValueChange(color, e.target.value)}
            />
            <input
              type="text"
              placeholder="#RRGGBB"
              value={color.value}
              onChange={(e) => onColorHexInputChange(color, e.target.value)}
              style={{
                fontFamily: 'var(--font-monospace)',
                width: '90px',
                textAlign: 'center',
                borderColor: activeError?.colorIds.includes(color.id) && activeError.errorType === 'invalid-hex' ? 'var(--text-error)' : undefined,
                borderWidth: activeError?.colorIds.includes(color.id) && activeError.errorType === 'invalid-hex' ? '2px' : undefined
              }}
            />
            <WideTextInput
              type="text"
              placeholder={color.name ? "Color name" : color.value}
              value={color.name}
              onChange={(e) => onColorNameChange(color, e.target.value)}
              style={{
                borderColor: activeError?.colorIds.includes(color.id) && activeError.errorType === 'duplicate-name' ? 'var(--text-error)' : undefined,
                borderWidth: activeError?.colorIds.includes(color.id) && activeError.errorType === 'duplicate-name' ? '2px' : undefined
              }}
            />
            <Button onClick={() => onRemoveColor(color, colorIndex)}>
              <TrashIcon />
            </Button>
          </SettingItemControlFull>
        </SettingItem>
      ))}
      <SettingItem>
        <SettingItemControlFull>
          <Button onClick={onAddColor}>
            <AddCircleIcon />
            <span>Add Color</span>
          </Button>
        </SettingItemControlFull>
      </SettingItem>
      {changed && (
        <SettingItem className="file-color-settings-save">
          <SettingItemInfo>
            <span className="mod-warning">You have unsaved palette changes.</span>
            {activeError && (
              <div style={{ 
                color: 'var(--text-error)', 
                marginTop: '8px',
                padding: '8px',
                backgroundColor: 'var(--background-secondary)',
                borderRadius: '4px',
                fontSize: '13px'
              }}>
                {activeError.message}
                {colorErrorQueue.length > 1 && (
                  <span style={{ marginLeft: '8px', opacity: 0.7 }}>
                    (+{colorErrorQueue.length - 1} more error{colorErrorQueue.length - 1 > 1 ? 's' : ''})
                  </span>
                )}
              </div>
            )}
          </SettingItemInfo>
          <SettingItemControl>
            <Button onClick={onRevert}>Revert changes</Button>
            <Button onClick={onSave}>Save</Button>
          </SettingItemControl>
        </SettingItem>
      )}

      <h2>Options</h2>
      <SettingItem className='mod-toggle'>
        <SettingItemInfo>
          <SettingItemName>Cascade Colors</SettingItemName>
          <SettingItemDescription>Folders will cascade their colors to sub-folders and notes, unless their colors are explicitly set.</SettingItemDescription>
        </SettingItemInfo>
       
        <SettingItemControl>
          <div className={'checkbox-container'+(cascadeColors?' is-enabled':'')} onClick={onChangeCascadeColors}>
            <input type='checkbox'></input>
          </div>
        </SettingItemControl>
      </SettingItem>

      <SettingItem className='mod-toggle'>
        <SettingItemInfo>
          <SettingItemName>Color Background</SettingItemName>
          <SettingItemDescription>Color the background instead of the text.</SettingItemDescription>
        </SettingItemInfo>
       
        <SettingItemControl>
          <div className={'checkbox-container'+(colorBackground?' is-enabled':'')} onClick={onChangeColorBackground}>
            <input type='checkbox'></input>
          </div>
        </SettingItemControl>
      </SettingItem>

      <SettingItem className='mod-toggle'>
        <SettingItemInfo>
          <SettingItemName>Folder Notes Compatibility</SettingItemName>
          <SettingItemDescription>Apply file colors to folders with the same name (e.g., Book.md colors Book folder).</SettingItemDescription>
        </SettingItemInfo>
       
        <SettingItemControl>
          <div className={'checkbox-container'+(folderNotesCompatibility?' is-enabled':'')} onClick={onChangeFolderNotesCompatibility}>
            <input type='checkbox'></input>
          </div>
        </SettingItemControl>
      </SettingItem>

      <h2>Color Groups</h2>
      <SettingItem>
        <SettingItemInfo>
          <SettingItemDescription>
            Apply colors automatically to files and folders matching multiple conditions.
          </SettingItemDescription>
        </SettingItemInfo>
      </SettingItem>
      
      <SettingItem>
        <SettingItemControlFull>
          <Button onClick={onAddGroup}>
            <AddCircleIcon />
            <span>Add Group</span>
          </Button>
        </SettingItemControlFull>
      </SettingItem>

      {groups.length < 1 && (
        <SettingItem>
          <SettingItemInfo>
            <span style={{ color: 'var(--text-muted)' }}>No groups configured yet. Add a group to automatically color files matching conditions.</span>
          </SettingItemInfo>
        </SettingItem>
      )}

      {[...groups].sort((a, b) => b.priority - a.priority).map((group, index, sortedGroups) => (
        <SettingItem key={group.id}>
          <SettingItemInfo>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="checkbox"
                checked={group.enabled}
                onChange={() => onGroupToggle(group.id)}
                style={{ cursor: 'pointer' }}
              />
              <SettingItemName style={{ margin: 0 }}>
                {group.name || <span style={{ color: 'var(--text-muted)' }}>(Unnamed group)</span>}
              </SettingItemName>
              <span style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                ({group.conditions.length} condition{group.conditions.length !== 1 ? 's' : ''})
              </span>
            </div>
          </SettingItemInfo>
          <SettingItemControl>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => onGroupMoveUp(group.id)}
                disabled={index === 0}
                style={{ 
                  padding: '4px 8px',
                  cursor: index === 0 ? 'not-allowed' : 'pointer',
                  opacity: index === 0 ? 0.5 : 1
                }}
                title="Increase priority"
              >
                ▲
              </button>
              <button
                onClick={() => onGroupMoveDown(group.id)}
                disabled={index === sortedGroups.length - 1}
                style={{ 
                  padding: '4px 8px',
                  cursor: index === sortedGroups.length - 1 ? 'not-allowed' : 'pointer',
                  opacity: index === sortedGroups.length - 1 ? 0.5 : 1
                }}
                title="Decrease priority"
              >
                ▼
              </button>
              <Button onClick={() => onConfigureGroup(group.id)}>
                <SettingsIcon />
              </Button>
              <Button onClick={() => onRemoveGroup(group.id)}>
                <TrashIcon />
              </Button>
            </div>
          </SettingItemControl>
        </SettingItem>
      ))}

      
    </div>
  )
}

import { debounce, MenuItem, Plugin } from 'obsidian'
import { SetColorModal } from 'plugin/SetColorModal'
import { FileColorSettingTab } from 'plugin/FileColorSettingTab'

import type { FileColorPluginSettings } from 'settings'
import { defaultSettings } from 'settings'

export class FileColorPlugin extends Plugin {
  settings: FileColorPluginSettings = defaultSettings
  saveSettingsInternalDebounced = debounce(this.saveSettingsInternal, 3000, true);

  async onload() {
    await this.loadSettings()

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        const addFileColorMenuItem = (item: MenuItem) => {
          item.setTitle('Set color')
          item.setIcon('palette')
          item.onClick(() => {
            new SetColorModal(this, file).open()
          })
        }

        menu.addItem(addFileColorMenuItem)
      })
    )

    this.app.workspace.onLayoutReady(async () => {
      this.generateColorStyles()
      this.applyColorStyles()
    })

    this.registerEvent(
      this.app.workspace.on('layout-change', () => this.applyColorStyles())
    )

    this.registerEvent(
      this.app.vault.on('rename', async (newFile, oldPath) => {
        this.settings.fileColors
          .filter((fileColor) => fileColor.path === oldPath)
          .forEach((fileColor) => {
            fileColor.path = newFile.path
          })
        this.saveSettings()
        this.applyColorStyles()
      })
    )

    this.registerEvent(
      this.app.vault.on('delete', async (file) => {
        this.settings.fileColors = this.settings.fileColors.filter(
          (fileColor) => !fileColor.path.startsWith(file.path)
        )
        this.saveSettings()
      })
    )

    this.addSettingTab(new FileColorSettingTab(this.app, this))
  }

  onunload() {
    document.getElementById('fileColorPluginStyles')?.remove();
    document.getElementById('fileColorPluginGooberStyles')?.remove();
  }

  async loadSettings() {
    this.settings = Object.assign({}, defaultSettings, await this.loadData())
  }

  async saveSettings(immediate?: boolean) {
    if (immediate) {
      return this.saveSettingsInternal();
    }
    return this.saveSettingsInternalDebounced();
  }

  private saveSettingsInternal() {
    return this.saveData(this.settings)
  }

  generateColorStyles() {
    let colorStyleEl = document.getElementById('fileColorPluginStyles')

    if (!colorStyleEl) {
      colorStyleEl = this.app.workspace.containerEl.createEl('style')
      colorStyleEl.id = 'fileColorPluginStyles'
    }

    colorStyleEl.innerHTML = this.settings.palette
      .map(
        (color) =>
          `.file-color-color-${color.id} { --file-color-color: ${color.value}; }`
      )
      .join('\n')
  }
  applyColorStyles = debounce(this.applyColorStylesInternal, 50, true);

  private async evaluateCondition(path: string, condition: any): Promise<boolean> {
    if (condition.type === 'regex') {
      try {
        const regex = new RegExp(condition.pattern)
        // Si matchFullPath está activado, usar el path completo, sino solo el nombre del archivo
        const targetString = condition.matchFullPath 
          ? path 
          : path.substring(path.lastIndexOf('/') + 1)
        return regex.test(targetString)
      } catch (e) {
        console.warn(`Invalid regex pattern: ${condition.pattern}`, e)
        return false
      }
    } else if (condition.type === 'property') {
      const file = this.app.vault.getAbstractFileByPath(path)
      if (!file || !('extension' in file) || file.extension !== 'md') {
        return false
      }

      try {
        const cache = this.app.metadataCache.getFileCache(file)
        const frontmatter = cache?.frontmatter
        
        if (!frontmatter) return false

        const propValue = frontmatter[condition.propertyName]
        
        if (propValue === undefined) return false

        // Evaluar operador
        switch (condition.propertyOperator) {
          case 'exists':
            return true

          case 'equals':
            return String(propValue) === String(condition.propertyValue)

          case 'contains':
            if (Array.isArray(propValue)) {
              return propValue.some(v => String(v) === String(condition.propertyValue))
            } else {
              return String(propValue).includes(String(condition.propertyValue))
            }
        }
      } catch (e) {
        console.warn(`Error evaluating property condition:`, e)
      }
    }

    return false
  }

  private applyColorStylesInternal() {
    const cssType = this.settings.colorBackground ? 'background' : 'text'

    const fileExplorers = this.app.workspace.getLeavesOfType('file-explorer')
    fileExplorers.forEach((fileExplorer) => {
      Object.entries(fileExplorer.view.fileItems).forEach(
        async ([path, fileItem]) => {
          const itemClasses = fileItem.el.classList.value
            .split(' ')
            .filter((cls) => !cls.startsWith('file-color'))

          // 1. Primero verificar si hay color manual (tiene prioridad máxima)
          const manualFile = this.settings.fileColors.find(
            (file) => file.path === path
          )

          let colorValue: string | undefined = manualFile?.color
          let isHexColor = false

          // 2. Si no hay color manual, evaluar grupos por prioridad
          if (!colorValue) {
            const enabledGroups = this.settings.groups
              .filter(group => group.enabled)
              .sort((a, b) => b.priority - a.priority)

            for (const group of enabledGroups) {
              try {
                // Un grupo sin condiciones no debe colorear nada
                if (group.conditions.length === 0) {
                  continue
                }

                // Evaluar TODAS las condiciones del grupo (AND logic)
                const conditionsResults = await Promise.all(
                  group.conditions.map(condition => this.evaluateCondition(path, condition))
                )

                // Solo aplicar si TODAS las condiciones son verdaderas
                const allConditionsMatch = conditionsResults.every(result => result === true)

                if (allConditionsMatch) {
                  // Determinar el color a usar
                  if (group.usePropertyAsColor) {
                    // Obtener color desde propiedad
                    const file = this.app.vault.getAbstractFileByPath(path)
                    if (file && 'extension' in file && file.extension === 'md') {
                      const cache = this.app.metadataCache.getFileCache(file)
                      const frontmatter = cache?.frontmatter
                      if (frontmatter && frontmatter[group.propertyNameForColor]) {
                        const hexPattern = /^#?[0-9A-Fa-f]{6}$/
                        const colorStr = String(frontmatter[group.propertyNameForColor]).trim()
                        if (hexPattern.test(colorStr)) {
                          colorValue = colorStr.startsWith('#') ? colorStr : '#' + colorStr
                          isHexColor = true
                        }
                      }
                    }
                  } else {
                    // Usar color de la paleta
                    colorValue = group.colorId
                  }

                  if (colorValue) {
                    break // Primer grupo que coincida gana
                  }
                }
              } catch (e) {
                console.warn(`Error evaluating group "${group.name}":`, e)
              }
            }
          }

          // 3. Aplicar el color si se encontró uno
          if (colorValue) {
            itemClasses.push('file-color-file')
            
            if (isHexColor) {
              // Para colores hex directos, crear un style inline
              fileItem.el.style.setProperty('--file-color-color', colorValue)
            } else {
              // Para colores de la paleta, usar la clase
              itemClasses.push('file-color-color-' + colorValue)
            }
            
            itemClasses.push('file-color-type-' + cssType)
            if (this.settings.cascadeColors) {
              itemClasses.push('file-color-cascade')
            }

            // 4. Folder Notes Compatibility: aplicar también a la carpeta con el mismo nombre
            if (this.settings.folderNotesCompatibility) {
              // Extraer el nombre del archivo sin extensión
              const lastSlashIndex = path.lastIndexOf('/')
              const fileBaseName = lastSlashIndex >= 0 ? path.substring(lastSlashIndex + 1) : path
              const lastDotIndex = fileBaseName.lastIndexOf('.')
              const fileNameWithoutExt = lastDotIndex >= 0 ? fileBaseName.substring(0, lastDotIndex) : fileBaseName
              
              // La carpeta padre del archivo
              const parentFolderPath = lastSlashIndex >= 0 ? path.substring(0, lastSlashIndex) : ''
              
              // Verificar si la carpeta padre tiene el mismo nombre que el archivo
              // Ej: "Book/Book.md" -> la carpeta "Book" debe colorearse
              const parentFolderName = parentFolderPath.substring(parentFolderPath.lastIndexOf('/') + 1)
              
              if (parentFolderName === fileNameWithoutExt) {
                // Buscar la carpeta en fileItems
                const folderItem = fileExplorer.view.fileItems[parentFolderPath]
                if (folderItem) {
                  const folderClasses = folderItem.el.classList.value
                    .split(' ')
                    .filter((cls) => !cls.startsWith('file-color'))

                  folderClasses.push('file-color-file')
                  
                  if (isHexColor) {
                    folderItem.el.style.setProperty('--file-color-color', colorValue)
                  } else {
                    folderClasses.push('file-color-color-' + colorValue)
                  }
                  
                  folderClasses.push('file-color-type-' + cssType)
                  if (this.settings.cascadeColors) {
                    folderClasses.push('file-color-cascade')
                  }
                  
                  folderItem.el.classList.value = folderClasses.join(' ')
                }
              }
            }
          } else {
            // Limpiar style inline si no hay color
            fileItem.el.style.removeProperty('--file-color-color')
          }

          fileItem.el.classList.value = itemClasses.join(' ')
        }
      )
    })
  }

}

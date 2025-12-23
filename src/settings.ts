export type FileColorPluginSettings = {
  cascadeColors: boolean
  colorBackground: boolean
  folderNotesCompatibility: boolean
  palette: Array<{
    id: string
    name: string
    value: string
  }>
  fileColors: Array<{
    path: string
    color: string
  }>
  groups: Array<{
    id: string
    name: string
    colorId: string
    usePropertyAsColor: boolean
    propertyNameForColor: string
    enabled: boolean
    priority: number
    conditions: Array<{
      id: string
      type: 'regex' | 'property'
      pattern: string
      matchFullPath: boolean
      propertyName: string
      propertyValue: string
      propertyOperator: 'equals' | 'contains' | 'exists'
    }>
  }>
}

export const defaultSettings: FileColorPluginSettings = {
  cascadeColors: false,
  colorBackground: false,
  folderNotesCompatibility: false,
  palette: [],
  fileColors: [],
  groups: [],
}

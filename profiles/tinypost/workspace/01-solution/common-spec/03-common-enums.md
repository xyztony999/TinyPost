# 公共枚举（Common Enums）

> 横切枚举：跨模块共用、语义稳定。来源 src/shared/types.ts，与代码同步维护。

| 枚举 | 值 | 使用方 |
|------|-----|--------|
| HttpMethod | GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS | 请求构建、历史、导入 |
| AuthType | none / bearer / basic / apikey | 请求构建、导入 |
| BodyMode | raw / form-data / urlencoded | 请求构建、导入、发送 |
| FormFieldType | text / file | form-data 字段编辑 |

> 注：主题仅「跟随系统」行为，代码中无 AppTheme 枚举与主题设置项（README 为描述性表述）。

package services

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/septimus-os/backend-core/models"
	"gorm.io/gorm"
)

type RecordFilter struct {
	And   []RecordFilter `json:"and,omitempty"`
	Or    []RecordFilter `json:"or,omitempty"`
	Field string         `json:"field,omitempty"`
	Op    string         `json:"op,omitempty"`
	Value interface{}    `json:"value,omitempty"`
}

type RecordQueryRequest struct {
	Filter *RecordFilter `json:"filter,omitempty"`
	Limit  int           `json:"limit,omitempty"`
	Cursor string        `json:"cursor,omitempty"`
}

type recordCursor struct {
	CreatedAt time.Time `json:"created_at"`
	ID        string    `json:"id"`
}

func CompileRecordFilter(filter RecordFilter, fields []SchemaFieldInput) (string, []interface{}, error) {
	allowed := make(map[string]string, len(fields))
	for _, field := range fields {
		allowed[field.Key] = field.Type
	}
	return compileRecordFilterNode(filter, allowed, 0)
}

func compileRecordFilterNode(filter RecordFilter, allowed map[string]string, depth int) (string, []interface{}, error) {
	if depth > 8 {
		return "", nil, fmt.Errorf("filter nesting exceeds 8 levels")
	}
	if len(filter.And) > 0 || len(filter.Or) > 0 {
		if filter.Field != "" || (len(filter.And) > 0 && len(filter.Or) > 0) {
			return "", nil, fmt.Errorf("filter groups must contain exactly one of and/or")
		}
		group, joiner := filter.And, " AND "
		if len(group) == 0 {
			group, joiner = filter.Or, " OR "
		}
		if len(group) > 20 {
			return "", nil, fmt.Errorf("filter group exceeds 20 clauses")
		}
		parts := make([]string, 0, len(group))
		args := []interface{}{}
		for _, child := range group {
			sql, childArgs, err := compileRecordFilterNode(child, allowed, depth+1)
			if err != nil {
				return "", nil, err
			}
			parts = append(parts, "("+sql+")")
			args = append(args, childArgs...)
		}
		return strings.Join(parts, joiner), args, nil
	}
	fieldType, ok := allowed[filter.Field]
	if !ok || filter.Field == "" {
		return "", nil, fmt.Errorf("unknown filter field")
	}
	expression := "data ->> ?"
	switch fieldType {
	case "number", "integer", "formula":
		expression = "(data ->> ?)::numeric"
	case "boolean":
		expression = "(data ->> ?)::boolean"
	case "date":
		expression = "(data ->> ?)::date"
	case "datetime":
		expression = "(data ->> ?)::timestamptz"
	}
	args := []interface{}{filter.Field}
	switch filter.Op {
	case "eq":
		return expression + " = ?", append(args, filter.Value), nil
	case "neq":
		return expression + " <> ?", append(args, filter.Value), nil
	case "gt", "gte", "lt", "lte":
		operator := map[string]string{"gt": ">", "gte": ">=", "lt": "<", "lte": "<="}[filter.Op]
		return expression + " " + operator + " ?", append(args, filter.Value), nil
	case "contains", "starts_with":
		if fieldType != "text" && fieldType != "list" {
			return "", nil, fmt.Errorf("%s is only valid for text fields", filter.Op)
		}
		value := escapeLike(fmt.Sprint(filter.Value))
		if filter.Op == "contains" {
			value = "%" + value + "%"
		} else {
			value += "%"
		}
		return expression + ` ILIKE ? ESCAPE '\'`, append(args, value), nil
	case "in":
		values, ok := filter.Value.([]interface{})
		if !ok || len(values) == 0 || len(values) > 100 {
			return "", nil, fmt.Errorf("in requires 1 to 100 values")
		}
		return expression + " IN ?", append(args, values), nil
	case "is_null":
		return "(NOT (data ? ?) OR " + expression + " IS NULL)", append(args, filter.Field), nil
	default:
		return "", nil, fmt.Errorf("unsupported filter operator")
	}
}

func escapeLike(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `%`, `\%`)
	return strings.ReplaceAll(value, `_`, `\_`)
}

func applyRecordQuery(query *gorm.DB, request RecordQueryRequest, fields []SchemaFieldInput) (*gorm.DB, int, error) {
	limit := request.Limit
	if limit < 1 || limit > 100 {
		limit = 30
	}
	if request.Filter != nil {
		sql, args, err := CompileRecordFilter(*request.Filter, fields)
		if err != nil {
			return nil, 0, err
		}
		query = query.Where(sql, args...)
	}
	if request.Cursor != "" {
		raw, err := base64.RawURLEncoding.DecodeString(request.Cursor)
		if err != nil {
			return nil, 0, fmt.Errorf("invalid cursor")
		}
		var cursor recordCursor
		if json.Unmarshal(raw, &cursor) != nil || cursor.CreatedAt.IsZero() || cursor.ID == "" {
			return nil, 0, fmt.Errorf("invalid cursor")
		}
		query = query.Where("(created_at, id) < (?, ?)", cursor.CreatedAt, cursor.ID)
	}
	return query.Order("created_at DESC, id DESC").Limit(limit + 1), limit, nil
}

func encodeRecordCursor(entity models.Entity) string {
	raw, _ := json.Marshal(recordCursor{CreatedAt: entity.CreatedAt, ID: entity.ID.String()})
	return base64.RawURLEncoding.EncodeToString(raw)
}

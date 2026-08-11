package services

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode"
)

// FormulaExpression is a deliberately small arithmetic AST. It never evaluates
// JavaScript, SQL, templates, functions, or property paths.
type FormulaExpression interface {
	Evaluate(values map[string]interface{}) (float64, error)
	Dependencies() []string
}

type formulaNumber float64

func (n formulaNumber) Evaluate(map[string]interface{}) (float64, error) { return float64(n), nil }
func (n formulaNumber) Dependencies() []string                           { return nil }

type formulaReference string

func (r formulaReference) Evaluate(values map[string]interface{}) (float64, error) {
	value, exists := values[string(r)]
	if !exists || value == nil {
		return 0, nil
	}
	switch typed := value.(type) {
	case float64:
		return typed, nil
	case float32:
		return float64(typed), nil
	case int:
		return float64(typed), nil
	case int64:
		return float64(typed), nil
	case jsonNumber:
		return strconv.ParseFloat(string(typed), 64)
	default:
		return 0, fmt.Errorf("field %s is not numeric", r)
	}
}
func (r formulaReference) Dependencies() []string { return []string{string(r)} }

// jsonNumber keeps the evaluator independent from encoding/json's concrete
// type while still allowing callers to preserve numeric input.
type jsonNumber string

type formulaBinary struct {
	op          rune
	left, right FormulaExpression
}

func (b formulaBinary) Evaluate(values map[string]interface{}) (float64, error) {
	left, err := b.left.Evaluate(values)
	if err != nil {
		return 0, err
	}
	right, err := b.right.Evaluate(values)
	if err != nil {
		return 0, err
	}
	var result float64
	switch b.op {
	case '+':
		result = left + right
	case '-':
		result = left - right
	case '*':
		result = left * right
	case '/':
		if right == 0 {
			return 0, fmt.Errorf("division by zero")
		}
		result = left / right
	}
	if math.IsInf(result, 0) || math.IsNaN(result) {
		return 0, fmt.Errorf("formula result is not finite")
	}
	return result, nil
}

func (b formulaBinary) Dependencies() []string {
	return append(b.left.Dependencies(), b.right.Dependencies()...)
}

type formulaParser struct {
	input []rune
	pos   int
}

func ParseFormula(input string) (FormulaExpression, error) {
	if len(input) > 500 {
		return nil, fmt.Errorf("expression exceeds 500 characters")
	}
	parser := &formulaParser{input: []rune(strings.TrimSpace(input))}
	expression, err := parser.parseExpression()
	if err != nil {
		return nil, err
	}
	parser.skipSpaces()
	if parser.pos != len(parser.input) {
		return nil, fmt.Errorf("unexpected token at position %d", parser.pos+1)
	}
	return expression, nil
}

func (p *formulaParser) parseExpression() (FormulaExpression, error) {
	left, err := p.parseTerm()
	if err != nil {
		return nil, err
	}
	for {
		p.skipSpaces()
		if !p.consume('+') && !p.consume('-') {
			return left, nil
		}
		op := p.input[p.pos-1]
		right, err := p.parseTerm()
		if err != nil {
			return nil, err
		}
		left = formulaBinary{op: op, left: left, right: right}
	}
}

func (p *formulaParser) parseTerm() (FormulaExpression, error) {
	left, err := p.parseFactor()
	if err != nil {
		return nil, err
	}
	for {
		p.skipSpaces()
		if !p.consume('*') && !p.consume('/') {
			return left, nil
		}
		op := p.input[p.pos-1]
		right, err := p.parseFactor()
		if err != nil {
			return nil, err
		}
		left = formulaBinary{op: op, left: left, right: right}
	}
}

func (p *formulaParser) parseFactor() (FormulaExpression, error) {
	p.skipSpaces()
	if p.consume('-') {
		value, err := p.parseFactor()
		if err != nil {
			return nil, err
		}
		return formulaBinary{op: '*', left: formulaNumber(-1), right: value}, nil
	}
	if p.consume('(') {
		value, err := p.parseExpression()
		if err != nil {
			return nil, err
		}
		p.skipSpaces()
		if !p.consume(')') {
			return nil, fmt.Errorf("missing closing parenthesis")
		}
		return value, nil
	}
	if p.peek() == '[' {
		p.pos++
		start := p.pos
		for p.pos < len(p.input) && p.input[p.pos] != ']' {
			p.pos++
		}
		if p.pos == len(p.input) {
			return nil, fmt.Errorf("missing closing bracket")
		}
		key := strings.TrimSpace(string(p.input[start:p.pos]))
		p.pos++
		if !IsValidDefinitionKey(key) {
			return nil, fmt.Errorf("invalid field reference %q", key)
		}
		return formulaReference(key), nil
	}
	start := p.pos
	for p.pos < len(p.input) && (unicode.IsDigit(p.input[p.pos]) || p.input[p.pos] == '.') {
		p.pos++
	}
	if start == p.pos {
		return nil, fmt.Errorf("expected number or [field_key] at position %d", p.pos+1)
	}
	number, err := strconv.ParseFloat(string(p.input[start:p.pos]), 64)
	if err != nil {
		return nil, fmt.Errorf("invalid number")
	}
	return formulaNumber(number), nil
}

func (p *formulaParser) skipSpaces() {
	for p.pos < len(p.input) && unicode.IsSpace(p.input[p.pos]) {
		p.pos++
	}
}
func (p *formulaParser) consume(expected rune) bool {
	if p.pos < len(p.input) && p.input[p.pos] == expected {
		p.pos++
		return true
	}
	return false
}
func (p *formulaParser) peek() rune {
	if p.pos >= len(p.input) {
		return 0
	}
	return p.input[p.pos]
}

func ValidateFormulaGraph(fields []SchemaFieldInput) error {
	fieldTypes := make(map[string]string, len(fields))
	formulas := map[string]FormulaExpression{}
	for _, field := range fields {
		fieldTypes[field.Key] = field.Type
		if field.Type == "formula" && field.Formula != nil {
			expression, err := ParseFormula(field.Formula.Expression)
			if err != nil {
				return fmt.Errorf("formula %s: %w", field.Key, err)
			}
			formulas[field.Key] = expression
		}
	}
	for key, expression := range formulas {
		for _, dependency := range expression.Dependencies() {
			fieldType, exists := fieldTypes[dependency]
			if !exists {
				return fmt.Errorf("formula %s references unknown field %s", key, dependency)
			}
			if fieldType != "number" && fieldType != "integer" && fieldType != "formula" {
				return fmt.Errorf("formula %s references non-numeric field %s", key, dependency)
			}
		}
	}
	visiting, visited := map[string]bool{}, map[string]bool{}
	var visit func(string) error
	visit = func(key string) error {
		if visiting[key] {
			return fmt.Errorf("formula cycle detected at %s", key)
		}
		if visited[key] {
			return nil
		}
		visiting[key] = true
		if expression := formulas[key]; expression != nil {
			for _, dependency := range expression.Dependencies() {
				if formulas[dependency] != nil {
					if err := visit(dependency); err != nil {
						return err
					}
				}
			}
		}
		visiting[key] = false
		visited[key] = true
		return nil
	}
	for key := range formulas {
		if err := visit(key); err != nil {
			return err
		}
	}
	return nil
}

func ApplyFormulaFields(fields []SchemaFieldInput, data map[string]interface{}) error {
	for passes := 0; passes <= len(fields); passes++ {
		progress := false
		for _, field := range fields {
			if field.Type != "formula" || field.Formula == nil {
				continue
			}
			expression, err := ParseFormula(field.Formula.Expression)
			if err != nil {
				return err
			}
			ready := true
			for _, dependency := range expression.Dependencies() {
				if dependencyFieldType(fields, dependency) == "formula" {
					if _, exists := data[dependency]; !exists {
						ready = false
					}
				}
			}
			if !ready {
				continue
			}
			value, err := expression.Evaluate(data)
			if err != nil {
				return fmt.Errorf("formula %s: %w", field.Key, err)
			}
			data[field.Key] = value
			progress = true
		}
		if !progress {
			break
		}
	}
	for _, field := range fields {
		if field.Type == "formula" {
			if _, exists := data[field.Key]; !exists {
				return fmt.Errorf("formula %s could not be evaluated", field.Key)
			}
		}
	}
	return nil
}

func dependencyFieldType(fields []SchemaFieldInput, key string) string {
	for _, field := range fields {
		if field.Key == key {
			return field.Type
		}
	}
	return ""
}

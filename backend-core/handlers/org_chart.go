package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

type GraphNode struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Group string `json:"group"` // "department" or "user"
	Role  string `json:"role,omitempty"`
}

type GraphLink struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Type   string `json:"type"` // "reports_to", "manages", "sub_department"
}

type GraphData struct {
	Nodes []GraphNode `json:"nodes"`
	Links []GraphLink `json:"links"`
}

// GetOrgChartGraph returns all users and departments as a graph structure
func GetOrgChartGraph(c *fiber.Ctx) error {
	workspaceID, _ := c.Locals("workspace_id").(string)
	if workspaceID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing workspace context"})
	}
	var users []models.User
	var departments []models.Department

	// Both users and departments are workspace-scoped from the session.
	if err := database.GetDB(c).Where("workspace_id = ?", workspaceID).Find(&users).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch users"})
	}

	if err := database.GetDB(c).Where("workspace_id = ?", workspaceID).Find(&departments).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch departments"})
	}

	nodes := []GraphNode{}
	links := []GraphLink{}

	// Create nodes and links for departments
	for _, dept := range departments {
		nodes = append(nodes, GraphNode{
			ID:    dept.ID.String(),
			Name:  dept.Name,
			Group: "department",
		})

		if dept.ParentID != nil {
			links = append(links, GraphLink{
				Source: dept.ID.String(),
				Target: dept.ParentID.String(),
				Type:   "sub_department",
			})
		}
		if dept.ManagerID != nil {
			links = append(links, GraphLink{
				Source: dept.ManagerID.String(),
				Target: dept.ID.String(),
				Type:   "manages",
			})
		}
	}

	// Create nodes and links for users
	for _, user := range users {
		nodes = append(nodes, GraphNode{
			ID:    user.ID.String(),
			Name:  user.Email, // Using email as name fallback
			Group: "user",
			Role:  user.Role,
		})

		if user.DepartmentID != nil {
			links = append(links, GraphLink{
				Source: user.ID.String(),
				Target: user.DepartmentID.String(),
				Type:   "reports_to",
			})
		}
	}

	return c.JSON(GraphData{
		Nodes: nodes,
		Links: links,
	})
}

package store

import (
	"context"
	"slices"

	"github.com/pkg/errors"
)

// hasAnonymousReactionCount recognizes the schema shipped by the personal
// 0.31 fork without relying on a release number or attempting duplicate DDL.
func (s *Store) hasAnonymousReactionCount(ctx context.Context) (bool, error) {
	rows, err := s.driver.GetDB().QueryContext(ctx, "SELECT * FROM reaction WHERE 1 = 0")
	if err != nil {
		return false, errors.Wrap(err, "failed to inspect reaction schema")
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return false, errors.Wrap(err, "failed to read reaction columns")
	}
	return slices.Contains(columns, "anonymous_count"), errors.Wrap(rows.Err(), "failed to inspect reaction columns")
}

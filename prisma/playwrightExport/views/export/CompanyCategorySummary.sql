WITH cat_counts AS (
  SELECT
    industry_chain_edges.from_code,
    industry_chain_edges.product_category,
    count(*) AS cnt,
    max(industry_chain_edges.category_updated_at) AS last_updated
  FROM
    industry_chain_edges
  WHERE
    (
      (
        industry_chain_edges.product_category IS NOT NULL
      )
      AND (
        industry_chain_edges.product_category <> '其他/未分類' :: text
      )
    )
  GROUP BY
    industry_chain_edges.from_code,
    industry_chain_edges.product_category
),
totals AS (
  SELECT
    cat_counts.from_code,
    sum(cat_counts.cnt) AS total,
    max(cat_counts.last_updated) AS last_updated
  FROM
    cat_counts
  GROUP BY
    cat_counts.from_code
),
ranked AS (
  SELECT
    cat_counts.from_code,
    cat_counts.product_category,
    cat_counts.cnt,
    row_number() OVER (
      PARTITION BY cat_counts.from_code
      ORDER BY
        cat_counts.cnt DESC
    ) AS rn
  FROM
    cat_counts
)
SELECT
  l.code,
  l.short_name AS name,
  r.product_category AS category,
  COALESCE(r.cnt, (0) :: bigint) AS category_count,
  COALESCE(t.total, (0) :: numeric) AS sample_size,
  CASE
    WHEN (t.total > (0) :: numeric) THEN round(((r.cnt) :: numeric / t.total), 4)
    ELSE NULL :: numeric
  END AS confidence,
  g.coarse_group,
  t.last_updated AS updated_at
FROM
  (
    (
      (
        twse_tpex_listed_companies l
        LEFT JOIN totals t ON ((t.from_code = l.code))
      )
      LEFT JOIN ranked r ON (
        (
          (r.from_code = l.code)
          AND (r.rn = 1)
        )
      )
    )
    LEFT JOIN product_category_groups g ON ((g.category = r.product_category))
  );
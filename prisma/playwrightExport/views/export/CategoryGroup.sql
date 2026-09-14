SELECT
  coarse_group,
  category AS fine_category
FROM
  product_category_groups
ORDER BY
  coarse_group,
  category;
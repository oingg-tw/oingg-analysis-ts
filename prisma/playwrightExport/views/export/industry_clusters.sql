SELECT
  DISTINCT cluster_id,
  label
FROM
  industry_chain_clusters
WHERE
  (label IS NOT NULL)
ORDER BY
  cluster_id;
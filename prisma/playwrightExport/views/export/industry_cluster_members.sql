SELECT
  code,
  cluster_id,
  sub_cluster_id,
  sub_label,
  cluster_size,
  computed_at
FROM
  industry_chain_clusters
ORDER BY
  cluster_id,
  sub_cluster_id NULLS FIRST,
  code;
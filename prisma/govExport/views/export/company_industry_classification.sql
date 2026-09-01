SELECT
  cp.stock_code,
  cp.tax_id,
  cic.industry_code,
  cic.source_industry_name,
  tic.section_code,
  tic.division_code,
  tic.group_code,
  tic.class_code,
  tic.subclass_code,
  tic.name_zh AS classification_name_zh,
  cic.updated_at
FROM
  (
    (
      company_industry_classifications cic
      JOIN company_profiles cp ON ((cp.tax_id = cic.tax_id))
    )
    JOIN tax_industry_classification tic ON ((tic.code = cic.industry_code))
  );
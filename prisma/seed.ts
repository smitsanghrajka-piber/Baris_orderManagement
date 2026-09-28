/* eslint-disable no-console */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CUSTOMER_ROLES, PERMISSIONS, ROLE_MATRIX, STAFF_ROLES } from '../src/common/auth/permission-catalogue';

const prisma = new PrismaClient();

/**
 * Idempotent seed: roles, permissions, lookups, numbering, default route and
 * checklists, notification rules, company settings and the first admin. Safe
 * to re-run; it upserts by code and never deletes.
 */
async function main() {
  // ─── permissions & roles ───
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({ where: { code: p.code }, update: { module: p.module, action: p.action, description: p.description }, create: p });
  }
  const perms = await prisma.permission.findMany();
  const permId = new Map(perms.map((p) => [p.code, p.id]));

  const roleDefs = [
    ...Object.entries(STAFF_ROLES).map(([code, name]) => ({ code, name, scope: 'STAFF' as const })),
    ...Object.entries(CUSTOMER_ROLES).map(([code, name]) => ({ code, name, scope: 'CUSTOMER' as const })),
  ];
  for (const r of roleDefs) {
    const role = await prisma.role.upsert({ where: { code: r.code }, update: { name: r.name, scope: r.scope, isSystem: true }, create: { ...r, isSystem: true } });
    const codes = ROLE_MATRIX[r.code as keyof typeof ROLE_MATRIX] ?? [];
    // System roles track the catalogue exactly.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: codes.map((c) => ({ roleId: role.id, permissionId: permId.get(c)! })).filter((x) => x.permissionId), skipDuplicates: true });
  }

  // ─── lookups ───
  const up = async (model: any, rows: any[]) => { for (const r of rows) await model.upsert({ where: { code: r.code }, update: r, create: r }); };
  await up(prisma.material, [
    { code: 'PP_WHITE_57', name: 'PP white 57 µm', micronDefault: 57, sortOrder: 1 },
    { code: 'PP_WHITE_60', name: 'PP white 60 µm', micronDefault: 60, sortOrder: 2 },
    { code: 'PP_CLEAR_57', name: 'PP clear 57 µm', micronDefault: 57, sortOrder: 3 },
    { code: 'PP_SILVER_57', name: 'PP metallised silver 57 µm', micronDefault: 57, sortOrder: 4 },
  ]);
  await up(prisma.finish, [
    { code: 'GLOSS', name: 'Gloss', sortOrder: 1 }, { code: 'MATTE', name: 'Matte', sortOrder: 2 }, { code: 'SOFT_TOUCH', name: 'Soft touch', sortOrder: 3 }, { code: 'SATIN', name: 'Satin', sortOrder: 4 },
  ]);
  await up(prisma.colourSystem, [
    { code: 'CMYK', name: 'CMYK process', sortOrder: 1 }, { code: 'PANTONE', name: 'Pantone (PMS)', sortOrder: 2 }, { code: 'WHITE', name: 'White ink', sortOrder: 3 },
    { code: 'METALLIC', name: 'Metallic', sortOrder: 4 }, { code: 'SPOT', name: 'Spot colour', sortOrder: 5 }, { code: 'CUSTOM', name: 'Custom ink', sortOrder: 6 },
  ]);
  await up(prisma.labelType, [
    { code: 'FRONT', name: 'Front label', sortOrder: 1 }, { code: 'BACK', name: 'Back label', sortOrder: 2 }, { code: 'WRAP', name: 'Wrap-around', sortOrder: 3 }, { code: 'LID', name: 'Lid label', sortOrder: 4 }, { code: 'BASE', name: 'Base label', sortOrder: 5 },
  ]);
  await up(prisma.applicationType, [
    { code: 'PAINT_PAIL', name: 'Paint pail', sortOrder: 1 }, { code: 'FOOD_TUB', name: 'Food tub', sortOrder: 2 }, { code: 'LID', name: 'Lid', sortOrder: 3 }, { code: 'BUCKET', name: 'Bucket', sortOrder: 4 }, { code: 'OTHER', name: 'Other', sortOrder: 9 },
  ]);
  await up(prisma.paymentTerm, [
    { code: 'PREPAID', name: 'Prepaid', days: 0, sortOrder: 1 }, { code: 'COD', name: 'Cash on delivery', days: 0, sortOrder: 2 }, { code: 'NET7', name: '7 days', days: 7, sortOrder: 3 }, { code: 'NET14', name: '14 days', days: 14, sortOrder: 4 }, { code: 'NET30', name: '30 days', days: 30, sortOrder: 5 }, { code: 'EOM30', name: '30 days EOM', days: 30, sortOrder: 6 },
  ]);
  await up(prisma.carrier, [
    { code: 'CUSTOMER_PICKUP', name: 'Customer pick-up', sortOrder: 1 }, { code: 'BARIS_DELIVERY', name: 'Baris delivery', sortOrder: 2 }, { code: 'TNT', name: 'TNT', sortOrder: 3 }, { code: 'STARTRACK', name: 'StarTrack', sortOrder: 4 }, { code: 'OTHER', name: 'Other', sortOrder: 9 },
  ]);
  await up(prisma.machine, [
    { code: 'PRESS_1', name: 'Press 1', type: 'PRESS', sortOrder: 1 }, { code: 'DIECUT_1', name: 'Die cutter 1', type: 'DIE_CUTTER', sortOrder: 2 },
  ]);

  // ─── production stages & default route (ASSUMPTION — confirm with Baris, Q13) ───
  const stages = [
    { code: 'MATERIAL_ALLOC', name: 'Material allocation', category: 'PREP', sortOrder: 1 },
    { code: 'PREPRESS_RELEASE', name: 'Prepress released', category: 'PREP', sortOrder: 2 },
    { code: 'PLATE_PREP', name: 'Plate / cylinder preparation', category: 'PREP', sortOrder: 3 },
    { code: 'PRINTING', name: 'Printing', category: 'PRINTING', sortOrder: 4 },
    { code: 'PRINT_INSPECTION', name: 'Print inspection', category: 'INSPECTION', sortOrder: 5 },
    { code: 'FINISHING', name: 'Finishing (varnish / lamination)', category: 'FINISHING', sortOrder: 6 },
    { code: 'DIE_CUTTING', name: 'Die cutting', category: 'FINISHING', sortOrder: 7 },
    { code: 'COUNTING', name: 'Counting', category: 'PACKING', sortOrder: 8 },
    { code: 'PACKING', name: 'Packing', category: 'PACKING', sortOrder: 9 },
    { code: 'FINAL_QC', name: 'Final QC', category: 'INSPECTION', sortOrder: 10 },
  ] as const;
  for (const s of stages) await prisma.productionStageDefinition.upsert({ where: { code: s.code }, update: { name: s.name, category: s.category, sortOrder: s.sortOrder }, create: s });
  const stageIds = new Map((await prisma.productionStageDefinition.findMany()).map((s) => [s.code, s.id]));

  const qcTemplate = await prisma.checklistTemplate.upsert({
    where: { code: 'QC_FINAL' }, update: {},
    create: { code: 'QC_FINAL', name: 'Final QC — IML label', kind: 'QC', items: { create: [
      { code: 'ARTWORK_REV', label: 'Artwork revision matches the job ticket', sequence: 1 },
      { code: 'DIMENSIONS', label: 'Dimensions within tolerance', sequence: 2 },
      { code: 'COLOUR', label: 'Colour matches reference / drawdown', sequence: 3 },
      { code: 'REGISTRATION', label: 'Registration acceptable', sequence: 4 },
      { code: 'PRINT_QUALITY', label: 'No print defects (hickeys, streaks, mottling)', sequence: 5 },
      { code: 'BARCODE', label: 'Barcode scans and decodes correctly', sequence: 6 },
      { code: 'SURFACE', label: 'No surface defects or scratches', sequence: 7 },
      { code: 'FINISH', label: 'Finish as specified', sequence: 8 },
      { code: 'CUTTING', label: 'Cutting accuracy and edge quality', sequence: 9 },
      { code: 'ORIENTATION', label: 'Orientation / stacking direction correct', sequence: 10 },
      { code: 'QUANTITY', label: 'Quantity counted and recorded', sequence: 11 },
      { code: 'PACKAGING', label: 'Packaging and labelling as specified', sequence: 12 },
    ] } },
  });
  await prisma.checklistTemplate.upsert({
    where: { code: 'PREPRESS_STD' }, update: {},
    create: { code: 'PREPRESS_STD', name: 'Prepress review — standard', kind: 'PREPRESS', items: { create: [
      { code: 'DIMENSIONS', label: 'Artwork dimensions match the specification', sequence: 1 },
      { code: 'BLEED', label: 'Bleed present and sufficient', sequence: 2 },
      { code: 'SAFE_AREA', label: 'Critical content inside safe area', sequence: 3 },
      { code: 'RESOLUTION', label: 'Image resolution adequate', sequence: 4 },
      { code: 'FONTS', label: 'Fonts embedded or outlined', sequence: 5 },
      { code: 'LINKS', label: 'Linked images supplied', sequence: 6 },
      { code: 'BARCODE', label: 'Barcode / QR code valid and scannable', sequence: 7 },
      { code: 'COLOURS', label: 'Colours match the specification (CMYK / Pantone)', sequence: 8 },
      { code: 'WHITE_LAYER', label: 'White layer correct', sequence: 9, isRequired: false },
      { code: 'VARNISH_LAYER', label: 'Varnish layer correct', sequence: 10, isRequired: false },
      { code: 'OVERPRINT', label: 'Overprint and trapping checked', sequence: 11 },
      { code: 'TRANSPARENCY', label: 'Transparency flattened / acceptable', sequence: 12, isRequired: false },
      { code: 'DIE_LINE', label: 'Die line matches the tool', sequence: 13 },
      { code: 'ORIENTATION', label: 'Orientation and print direction correct', sequence: 14 },
      { code: 'CUSTOMER_SPEC', label: 'Customer-specific requirements met', sequence: 15 },
    ] } },
  });

  const route = await prisma.productionRoute.upsert({ where: { code: 'STD_IML' }, update: {}, create: { code: 'STD_IML', name: 'Standard IML route', isDefault: true } });
  if ((await prisma.productionRouteStep.count({ where: { routeId: route.id } })) === 0) {
    const order = ['MATERIAL_ALLOC', 'PREPRESS_RELEASE', 'PLATE_PREP', 'PRINTING', 'PRINT_INSPECTION', 'FINISHING', 'DIE_CUTTING', 'COUNTING', 'PACKING', 'FINAL_QC'];
    await prisma.productionRouteStep.createMany({
      data: order.map((code, i) => ({
        routeId: route.id, stageDefinitionId: stageIds.get(code)!, sequence: i + 1,
        requiresQc: code === 'PRINT_INSPECTION' || code === 'FINAL_QC',
        qcChecklistTemplateId: code === 'FINAL_QC' ? qcTemplate.id : null,
        allowSkip: code === 'PLATE_PREP' || code === 'FINISHING',
      })),
    });
  }

  // ─── numbering (ASSUMPTION — confirm prefixes, Q18) ───
  const seqs: { key: string; prefix: string }[] = [
    { key: 'CUSTOMER', prefix: 'CUS' }, { key: 'SKU', prefix: 'SKU' }, { key: 'ARTWORK', prefix: 'ART' }, { key: 'QUOTATION', prefix: 'Q' },
    { key: 'SALES_ORDER', prefix: 'SO' }, { key: 'JOB', prefix: 'JOB' }, { key: 'DISPATCH', prefix: 'DSP' }, { key: 'NCR', prefix: 'NCR' }, { key: 'INSPECTION', prefix: 'QI' },
  ];
  for (const s of seqs) await prisma.numberSequence.upsert({ where: { key: s.key }, update: {}, create: { ...s, padding: 6, format: '{prefix}-{seq}' } });

  // ─── company settings ───
  await prisma.companySettings.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } });

  // ─── notification rules (ASSUMPTION — §13 defaults) ───
  const rules: { eventType: string; audience: any; roleCode?: string; contactFlag?: string; channel?: any; debounceMinutes?: number; digest?: boolean }[] = [
    { eventType: 'customer_user.created', audience: 'ACTOR_TARGET', channel: 'IN_APP' },
    { eventType: 'spec.approved', audience: 'ROLE', roleCode: 'PREPRESS' },
    { eventType: 'spec.approved', audience: 'SALES_REP' },
    { eventType: 'artwork.version.uploaded', audience: 'ROLE', roleCode: 'PREPRESS' },
    { eventType: 'artwork.version.uploaded', audience: 'SALES_REP' },
    { eventType: 'artwork.proof.sent', audience: 'CONTACT_FLAG', contactFlag: 'canApproveArtwork', channel: 'BOTH' },
    { eventType: 'artwork.proof.reminder', audience: 'CONTACT_FLAG', contactFlag: 'canApproveArtwork', channel: 'BOTH' },
    { eventType: 'artwork.comment.added', audience: 'ROLE', roleCode: 'PREPRESS', debounceMinutes: 15 },
    { eventType: 'artwork.comment.added', audience: 'CONTACT_FLAG', contactFlag: 'canApproveArtwork', debounceMinutes: 15 },
    { eventType: 'artwork.changes_requested', audience: 'ROLE', roleCode: 'PREPRESS', channel: 'BOTH' },
    { eventType: 'artwork.changes_requested', audience: 'SALES_REP', channel: 'BOTH' },
    { eventType: 'artwork.rejected', audience: 'ROLE', roleCode: 'PREPRESS', channel: 'BOTH' },
    { eventType: 'artwork.rejected', audience: 'SALES_REP', channel: 'BOTH' },
    { eventType: 'artwork.approved', audience: 'ROLE', roleCode: 'PREPRESS' },
    { eventType: 'artwork.approved', audience: 'ROLE', roleCode: 'PLANNER' },
    { eventType: 'artwork.approved', audience: 'SALES_REP' },
    { eventType: 'artwork.released', audience: 'ROLE', roleCode: 'PLANNER' },
    { eventType: 'quotation.issued', audience: 'CONTACT_FLAG', contactFlag: 'canAcceptQuotations', channel: 'BOTH' },
    { eventType: 'quotation.expiring', audience: 'CONTACT_FLAG', contactFlag: 'canAcceptQuotations', channel: 'BOTH' },
    { eventType: 'quotation.accepted', audience: 'ROLE', roleCode: 'SALES' },
    { eventType: 'quotation.accepted', audience: 'ROLE', roleCode: 'PLANNER' },
    { eventType: 'order.submitted', audience: 'ROLE', roleCode: 'SALES' },
    { eventType: 'order.submitted', audience: 'ROLE', roleCode: 'CUSTOMER_SERVICE' },
    { eventType: 'order.submitted', audience: 'ROLE', roleCode: 'PLANNER' },
    { eventType: 'production.started', audience: 'CONTACT_FLAG', contactFlag: 'receivesDispatchNotices' },
    { eventType: 'production.delayed', audience: 'ROLE', roleCode: 'PLANNER', digest: true },
    { eventType: 'production.delayed', audience: 'ROLE', roleCode: 'MANAGEMENT', digest: true },
    { eventType: 'quality.hold_raised', audience: 'ROLE', roleCode: 'QUALITY' },
    { eventType: 'quality.hold_raised', audience: 'ROLE', roleCode: 'PLANNER' },
    { eventType: 'quality.hold_raised', audience: 'ROLE', roleCode: 'MANAGEMENT' },
    { eventType: 'order.ready_for_dispatch', audience: 'ROLE', roleCode: 'DISPATCH' },
    { eventType: 'order.dispatched', audience: 'CONTACT_FLAG', contactFlag: 'receivesDispatchNotices', channel: 'BOTH' },
  ];
  if ((await prisma.notificationRule.count()) === 0) {
    await prisma.notificationRule.createMany({ data: rules.map((r) => ({ ...r, channel: r.channel ?? 'IN_APP' })) });
  }

  // ─── first admin ───
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@barisiml.com.au').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const superAdmin = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({ data: { email, name: 'Baris Administrator', passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true, roles: { create: [{ roleId: superAdmin.id }] } } });
    console.log(`Created admin ${email} (temporary password from SEED_ADMIN_PASSWORD; must be changed at first login)`);
  }

  console.log('Seed complete.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

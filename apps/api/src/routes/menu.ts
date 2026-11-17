import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth";

export const menuRouter = Router();

// GET /api/menu?branchId=...
// ສົ່ງໝວດໝູ່, ເມນູ ແລະ ຕົວເລືອກ ໃນຄຳຂໍດຽວ (ໃຊ້ໄດ້ທັງ online ແລະ ການ cache ໄວ້ offline)
menuRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const branchId = req.user!.branchId;

    const { rows } = await pool.query(
      `
      SELECT
        c.id AS category_id,
        c.name AS category_name,
        c.sort_order,
        i.id AS item_id,
        i.name AS item_name,
        i.price_lak,
        i.is_signature,
        g.id AS group_id,
        g.name AS group_name,
        g.is_required,
        o.id AS option_id,
        o.name AS option_name,
        o.extra_price_lak
      FROM menu_categories c
      JOIN menu_items i ON i.category_id = c.id AND i.is_active
      LEFT JOIN menu_option_groups g ON g.menu_item_id = i.id
      LEFT JOIN menu_options o ON o.option_group_id = g.id
      WHERE c.branch_id = $1
      ORDER BY c.sort_order, i.name, g.name, o.sort_order, o.name
      `,
      [branchId]
    );

    type Option = { id: string; name: string; extraPriceLak: number };
    type Group = { id: string; name: string; isRequired: boolean; options: Option[] };
    type Item = {
      id: string;
      name: string;
      priceLak: number | null;
      isSignature: boolean;
      optionGroups: Group[];
    };
    type Category = { id: string; name: string; items: Item[] };

    const categories = new Map<string, Category>();
    const items = new Map<string, Item>();
    const groups = new Map<string, Group>();

    for (const r of rows) {
      if (!categories.has(r.category_id)) {
        categories.set(r.category_id, { id: r.category_id, name: r.category_name, items: [] });
      }
      if (!items.has(r.item_id)) {
        const item: Item = {
          id: r.item_id,
          name: r.item_name,
          priceLak: r.price_lak === null ? null : Number(r.price_lak),
          isSignature: r.is_signature,
          optionGroups: [],
        };
        items.set(r.item_id, item);
        categories.get(r.category_id)!.items.push(item);
      }
      if (r.group_id && !groups.has(r.group_id)) {
        const group: Group = { id: r.group_id, name: r.group_name, isRequired: r.is_required, options: [] };
        groups.set(r.group_id, group);
        items.get(r.item_id)!.optionGroups.push(group);
      }
      if (r.option_id) {
        groups.get(r.group_id)!.options.push({
          id: r.option_id,
          name: r.option_name,
          extraPriceLak: Number(r.extra_price_lak),
        });
      }
    }

    res.json({ categories: [...categories.values()] });
  } catch (err) {
    next(err);
  }
});

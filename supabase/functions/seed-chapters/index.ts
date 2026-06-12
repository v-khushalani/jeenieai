import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  function slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "")
      .replace(/-+/g, "-")
      .slice(0, 60);
  }

  const PHYSICS = [
    "Units and Measurements",
    "Motion in a Straight Line",
    "Motion in a Plane",
    "Laws of Motion",
    "Work, Energy and Power",
    "System of Particles and Rotational Motion",
    "Gravitation",
    "Mechanical Properties of Solids",
    "Mechanical Properties of Fluids",
    "Thermal Properties of Matter",
    "Thermodynamics",
    "Kinetic Theory",
    "Oscillations",
    "Waves",
    "Electric Charges and Fields",
    "Electrostatic Potential and Capacitance",
    "Current Electricity",
    "Moving Charges and Magnetism",
    "Magnetism and Matter",
    "Electromagnetic Induction",
    "Alternating Current",
    "Electromagnetic Waves",
    "Ray Optics and Optical Instruments",
    "Wave Optics",
    "Dual Nature of Radiation and Matter",
    "Atoms",
    "Nuclei",
    "Semiconductor Electronics",
  ];

  const CHEMISTRY = [
    "Some Basic Concepts of Chemistry",
    "Structure of Atom",
    "Classification of Elements and Periodicity",
    "Chemical Bonding and Molecular Structure",
    "States of Matter",
    "Chemical Thermodynamics",
    "Equilibrium",
    "Redox Reactions",
    "Hydrogen",
    "s-Block Elements",
    "p-Block Elements",
    "d and f Block Elements",
    "Coordination Compounds",
    "Haloalkanes and Haloarenes",
    "Alcohols, Phenols and Ethers",
    "Aldehydes, Ketones and Carboxylic Acids",
    "Organic Compounds Containing Nitrogen",
    "Biomolecules",
    "Polymers",
    "Chemistry in Everyday Life",
  ];

  const MATH = [
    "Sets and Relations",
    "Trigonometric Functions",
    "Inverse Trigonometric Functions",
    "Complex Numbers and Quadratic Equations",
    "Linear Inequalities",
    "Permutations and Combinations",
    "Binomial Theorem",
    "Sequences and Series",
    "Straight Lines",
    "Conic Sections",
    "Introduction to Three Dimensional Geometry",
    "Limits, Continuity and Differentiability",
    "Derivatives",
    "Application of Derivatives",
    "Integrals",
    "Application of Integrals",
    "Differential Equations",
    "Vector Algebra",
    "Three Dimensional Geometry",
    "Probability",
    "Linear Programming",
    "Matrices and Determinants",
    "Statistics",
  ];

  const BIOLOGY = [
    "Cell: The Unit of Life",
    "Biomolecules",
    "Cell Cycle and Cell Division",
    "Transport in Plants",
    "Mineral Nutrition",
    "Photosynthesis",
    "Respiration",
    "Plant Growth and Development",
    "Digestion and Absorption",
    "Breathing and Gas Exchange",
    "Body Fluids and Circulation",
    "Excretory Products and their Elimination",
    "Locomotion and Movement",
    "Neural Control and Coordination",
    "Chemical Coordination and Integration",
    "Reproduction in Organisms",
    "Sexual Reproduction in Flowering Plants",
    "Human Reproduction",
    "Reproductive Health",
    "Principles of Inheritance and Variation",
    "Molecular Basis of Inheritance",
    "Evolution",
    "Human Health and Disease",
    "Strategies for Enhancement of Food Production",
    "Microbes in Human Welfare",
    "Biotechnology",
    "Organisms and Populations",
    "Ecosystem",
    "Biodiversity and Conservation",
    "Environmental Issues",
  ];

  try {
    // Get IDs
    const [subs, batches] = await Promise.all([
      supabase.from("subjects").select("id, code"),
      supabase.from("batches").select("id, slug, exam_type, grade"),
    ]);

    const subjectMap: Record<string, string> = {};
    subs.data?.forEach((s: any) => {
      subjectMap[s.code] = s.id;
    });

    const batchMap: Record<string, any> = {};
    batches.data?.forEach((b: any) => {
      batchMap[b.slug] = b.id;
    });

    const chapters: any[] = [];

    // JEE (P, C, M) - grades 11, 12
    for (const [sid, chaps] of [
      [subjectMap.PHYSICS, PHYSICS],
      [subjectMap.CHEMISTRY, CHEMISTRY],
      [subjectMap.MATHEMATICS, MATH],
    ] as const) {
      for (const [bid, grade] of [
        [batchMap["jee-11"], 11],
        [batchMap["jee-12"], 12],
      ] as const) {
        chaps.forEach((ch, idx) => {
          chapters.push({
            name: ch,
            slug: `${slugify(ch)}-${sid.slice(0, 8)}`,
            subject_id: sid,
            batch_id: bid,
            class_level: grade,
            display_order: idx + 1,
          });
        });
      }
    }

    // NEET (P, C, B) - grades 11, 12
    for (const [sid, chaps] of [
      [subjectMap.PHYSICS, PHYSICS],
      [subjectMap.CHEMISTRY, CHEMISTRY],
      [subjectMap.BIOLOGY, BIOLOGY],
    ] as const) {
      for (const [bid, grade] of [
        [batchMap["neet-11"], 11],
        [batchMap["neet-12"], 12],
      ] as const) {
        chaps.forEach((ch, idx) => {
          chapters.push({
            name: ch,
            slug: `${slugify(ch)}-${sid.slice(0, 8)}`,
            subject_id: sid,
            batch_id: bid,
            class_level: grade,
            display_order: idx + 1,
          });
        });
      }
    }

    console.log(`Seeding ${chapters.length} chapters...`);

    // Insert in batches of 100
    let inserted = 0;
    for (let i = 0; i < chapters.length; i += 100) {
      const batch = chapters.slice(i, i + 100);
      const { error, data } = await supabase
        .from("chapters")
        .upsert(batch, { onConflict: "slug" });

      if (error) {
        console.error(`Batch ${i / 100} error:`, error);
      } else {
        inserted += batch.length;
        console.log(`Batch ${i / 100}: ${data?.length || 0} rows`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, inserted, total: chapters.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

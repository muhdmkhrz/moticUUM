/* global homePageData, newsData */

(() => {
  const client = window.moticSupabase;
  const NEWS_BUCKET = "news-images";
  const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  function fallbackItems() {
    if (typeof newsData === "undefined" || !Array.isArray(newsData.items)) return [];

    return newsData.items.map((item) => ({
      ...item,
      databaseId: item.databaseId ?? null,
      imagePath: item.imagePath || "",
    }));
  }

  function fallbackPosters() {
    if (typeof homePageData === "undefined" || !Array.isArray(homePageData.homePosters)) return [];

    return homePageData.homePosters.map((poster, index) => ({
      databaseId: null,
      title: poster.title || "Announcement",
      image: poster.image,
      imagePath: "",
      alt: poster.alt || poster.title || "Upcoming announcement poster",
      link: poster.link || "",
      displayOrder: index,
      isActive: true,
    }));
  }

  function sortNewestFirst(items) {
    return [...items].sort((first, second) => {
      const dateDifference = new Date(second.date) - new Date(first.date);
      if (dateDifference !== 0) return dateDifference;
      return Number(second.databaseId || 0) - Number(first.databaseId || 0);
    });
  }

  function mapDatabaseRow(row) {
    return {
      id: row.slug,
      databaseId: row.id,
      title: row.title,
      date: row.published_date,
      category: row.category,
      image: row.image_url || "",
      imagePath: row.image_path || "",
      imageAlt: row.image_alt || "",
      excerpt: row.excerpt,
      content: Array.isArray(row.content) ? row.content : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function mapPosterRow(row) {
    return {
      databaseId: row.id,
      title: row.title,
      image: row.image_url,
      imagePath: row.image_path || "",
      alt: row.image_alt,
      link: row.link_url || "",
      displayOrder: row.display_order,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function mapGalleryRow(row) {
    return {
      databaseId: row.id,
      section: row.section,
      title: row.title,
      image: row.image_url,
      imagePath: row.image_path || "",
      alt: row.image_alt,
      caption: row.caption || "",
      link: row.link_url || "",
      displayOrder: row.display_order,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function requireClient() {
    if (!client) {
      throw new Error("The news service is not connected. Check supabase-config.js.");
    }

    return client;
  }

  async function getAllNews(options = {}) {
    const allowFallback = options.allowFallback !== false;

    if (!client) {
      if (allowFallback) return sortNewestFirst(fallbackItems());
      throw new Error("Supabase is not available.");
    }

    const { data, error } = await client
      .from("news")
      .select("id, slug, title, published_date, category, image_url, image_path, image_alt, excerpt, content, created_at, updated_at")
      .order("published_date", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      if (allowFallback) {
        console.warn("Live news could not be loaded. Showing the local backup.", error.message);
        return sortNewestFirst(fallbackItems());
      }
      throw error;
    }

    return data.map(mapDatabaseRow);
  }

  async function getNewsBySlug(slug, options = {}) {
    const allowFallback = options.allowFallback !== false;

    if (!slug) return null;

    if (!client) {
      return allowFallback
        ? fallbackItems().find((item) => item.id === slug) || null
        : null;
    }

    const { data, error } = await client
      .from("news")
      .select("id, slug, title, published_date, category, image_url, image_path, image_alt, excerpt, content, created_at, updated_at")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      if (allowFallback) {
        console.warn("The live story could not be loaded. Checking the local backup.", error.message);
        return fallbackItems().find((item) => item.id === slug) || null;
      }
      throw error;
    }

    if (data) return mapDatabaseRow(data);
    return allowFallback
      ? fallbackItems().find((item) => item.id === slug) || null
      : null;
  }

  async function getAllPosters(options = {}) {
    const allowFallback = options.allowFallback !== false;

    if (!client) {
      if (allowFallback) return fallbackPosters();
      throw new Error("Supabase is not available.");
    }

    const { data, error } = await client
      .from("posters")
      .select("id, title, image_url, image_path, image_alt, link_url, display_order, is_active, created_at, updated_at")
      .order("display_order", { ascending: true })
      .order("id", { ascending: false });

    if (error) {
      if (allowFallback) {
        console.warn("Live posters could not be loaded. Showing the local backup.", error.message);
        return fallbackPosters();
      }
      throw error;
    }

    return data.map(mapPosterRow);
  }

  async function getGalleryItems(section, options = {}) {
    const allowFallback = options.allowFallback !== false;

    if (!client) {
      if (allowFallback) return [];
      throw new Error("Supabase is not available.");
    }

    const { data, error } = await client
      .from("home_gallery")
      .select("id, section, title, image_url, image_path, image_alt, caption, link_url, display_order, is_active, created_at, updated_at")
      .eq("section", section)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("id", { ascending: false });

    if (error) {
      if (allowFallback) {
        console.warn(`The ${section} gallery could not be loaded.`, error.message);
        return [];
      }
      throw error;
    }

    return data.map(mapGalleryRow);
  }

  async function getGalleryItemsForAdmin(section) {
    const { data, error } = await requireClient()
      .from("home_gallery")
      .select("id, section, title, image_url, image_path, image_alt, caption, link_url, display_order, is_active, created_at, updated_at")
      .eq("section", section)
      .order("display_order", { ascending: true })
      .order("id", { ascending: false });

    if (error) throw error;
    return data.map(mapGalleryRow);
  }

  function normaliseGalleryInput(item) {
    return {
      section: item.section,
      title: item.title.trim(),
      image_url: item.image,
      image_path: item.imagePath || null,
      image_alt: item.alt.trim(),
      caption: item.caption?.trim() || null,
      link_url: item.link?.trim() || null,
      display_order: Number(item.displayOrder) || 0,
      is_active: Boolean(item.isActive),
    };
  }

  async function createGalleryItem(item) {
    const user = await requireAdmin();

    const { data, error } = await requireClient()
      .from("home_gallery")
      .insert({
        ...normaliseGalleryInput(item),
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return mapGalleryRow(data);
  }

  async function updateGalleryItem(databaseId, item) {
    await requireAdmin();

    const { data, error } = await requireClient()
      .from("home_gallery")
      .update({
        ...normaliseGalleryInput(item),
        updated_at: new Date().toISOString(),
      })
      .eq("id", databaseId)
      .select()
      .single();

    if (error) throw error;
    return mapGalleryRow(data);
  }

  async function deleteGalleryItem(databaseId) {
    await requireAdmin();

    const { error } = await requireClient()
      .from("home_gallery")
      .delete()
      .eq("id", databaseId);

    if (error) throw error;
  }

  async function uploadGalleryImage(file, section) {
    return uploadImage(file, `gallery/${section}`);
  }

  async function signIn(email, password) {
    const { data, error } = await requireClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) throw error;
    return data.user;
  }

  async function signOut() {
    const { error } = await requireClient().auth.signOut();
    if (error) throw error;
  }

  async function getCurrentUser() {
    const { data, error } = await requireClient().auth.getUser();
    if (error) return null;
    return data.user || null;
  }

  async function isAdmin(user = null) {
    const currentUser = user || await getCurrentUser();
    if (!currentUser) return false;

    const { data, error } = await requireClient()
      .from("admin_users")
      .select("user_id")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }

  async function requireAdmin() {
    const user = await getCurrentUser();
    if (!user) throw new Error("Please sign in again.");

    if (!await isAdmin(user)) {
      throw new Error("This account is not authorized to manage MOTIC news.");
    }

    return user;
  }

  function normaliseStoryInput(story) {
    return {
      slug: story.slug.trim(),
      title: story.title.trim(),
      published_date: story.date,
      category: story.category.trim() || "Club News",
      image_url: story.image || null,
      image_path: story.imagePath || null,
      image_alt: story.imageAlt?.trim() || null,
      excerpt: story.excerpt.trim(),
      content: Array.isArray(story.content)
        ? story.content.map((paragraph) => paragraph.trim()).filter(Boolean)
        : [],
    };
  }

  async function createNews(story) {
    const user = await requireAdmin();
    const payload = {
      ...normaliseStoryInput(story),
      created_by: user.id,
    };

    const { data, error } = await requireClient()
      .from("news")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return mapDatabaseRow(data);
  }

  async function updateNews(databaseId, story) {
    await requireAdmin();
    const payload = {
      ...normaliseStoryInput(story),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await requireClient()
      .from("news")
      .update(payload)
      .eq("id", databaseId)
      .select()
      .single();

    if (error) throw error;
    return mapDatabaseRow(data);
  }

  async function deleteNews(databaseId) {
    await requireAdmin();

    const { error } = await requireClient()
      .from("news")
      .delete()
      .eq("id", databaseId);

    if (error) throw error;
  }

  function normalisePosterInput(poster) {
    return {
      title: poster.title.trim(),
      image_url: poster.image,
      image_path: poster.imagePath || null,
      image_alt: poster.alt.trim(),
      link_url: poster.link?.trim() || null,
      display_order: Number(poster.displayOrder) || 0,
      is_active: Boolean(poster.isActive),
    };
  }

  async function createPoster(poster) {
    const user = await requireAdmin();

    const { data, error } = await requireClient()
      .from("posters")
      .insert({
        ...normalisePosterInput(poster),
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return mapPosterRow(data);
  }

  async function updatePoster(databaseId, poster) {
    await requireAdmin();

    const { data, error } = await requireClient()
      .from("posters")
      .update({
        ...normalisePosterInput(poster),
        updated_at: new Date().toISOString(),
      })
      .eq("id", databaseId)
      .select()
      .single();

    if (error) throw error;
    return mapPosterRow(data);
  }

  async function deletePoster(databaseId) {
    await requireAdmin();

    const { error } = await requireClient()
      .from("posters")
      .delete()
      .eq("id", databaseId);

    if (error) throw error;
  }

  function safeFileName(fileName) {
    const extension = fileName.includes(".")
      ? `.${fileName.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "")}`
      : "";

    const baseName = fileName
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "news-image";

    return `${baseName}${extension}`;
  }

  async function uploadImage(file, folder) {
    const user = await requireAdmin();

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      throw new Error("Please upload a JPG, PNG, WebP or GIF image.");
    }

    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error("The image must be 8 MB or smaller.");
    }

    const uniquePart =
      window.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const path = `${folder}/${user.id}/${uniquePart}-${safeFileName(file.name)}`;

    const { error } = await requireClient()
      .storage
      .from(NEWS_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;

    const { data } = requireClient()
      .storage
      .from(NEWS_BUCKET)
      .getPublicUrl(path);

    return {
      image: data.publicUrl,
      imagePath: path,
    };
  }

  async function uploadNewsImage(file) {
    return uploadImage(file, "news");
  }

  async function uploadPosterImage(file) {
    return uploadImage(file, "posters");
  }

  async function removeNewsImage(path) {
    if (!path) return;

    await requireAdmin();

    const { error } = await requireClient()
      .storage
      .from(NEWS_BUCKET)
      .remove([path]);

    if (error) throw error;
  }

  window.newsService = {
    getAllNews,
    getNewsBySlug,
    getAllPosters,
    signIn,
    signOut,
    getCurrentUser,
    isAdmin,
    createNews,
    updateNews,
    deleteNews,
    createPoster,
    updatePoster,
    deletePoster,
    getGalleryItems,
    getGalleryItemsForAdmin,
    createGalleryItem,
    updateGalleryItem,
    deleteGalleryItem,
    uploadNewsImage,
    uploadPosterImage,
    uploadGalleryImage,
    removeNewsImage,
  };
})();
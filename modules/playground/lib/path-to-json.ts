import * as fs from "fs";
import * as path from "path";

/**
 * Represents a file in the template structure
 */
export interface TemplateFile {
  filename: string;
  fileExtension: string;
  content: string;
}

/**
 * Represents a folder in the template structure
 */
export interface TemplateFolder {
  folderName: string;
  items: (TemplateFile | TemplateFolder)[];
}

export type TemplateItem = TemplateFile | TemplateFolder;

interface ScanOptions {
  ignoreFiles?: string[];
  ignoreFolders?: string[];
  ignorePatterns?: RegExp[];
  maxFileSize?: number;
}

/**
 * SAFE DEFAULT EMPTY TEMPLATE
 */
const EMPTY_TEMPLATE: TemplateFolder = {
  folderName: "empty-template",
  items: [],
};

/**
 * Scans a template directory and returns a structured JSON representation
 */
export async function scanTemplateDirectory(
  templatePath: string,
  options: ScanOptions = {}
): Promise<TemplateFolder> {
  const defaultOptions: ScanOptions = {
    ignoreFiles: [
      "package-lock.json",
      "yarn.lock",
      ".DS_Store",
      "thumbs.db",
      ".gitignore",
      ".npmrc",
      ".yarnrc",
      ".env",
      ".env.local",
      ".env.development",
      ".env.production",
    ],
    ignoreFolders: [
      "node_modules",
      ".git",
      ".vscode",
      ".idea",
      "dist",
      "build",
      "coverage",
    ],
    ignorePatterns: [/^\..+\.swp$/, /^\.#/, /~$/],
    maxFileSize: 1024 * 1024,
  };

  const mergedOptions: ScanOptions = {
    ignoreFiles: [...(defaultOptions.ignoreFiles || []), ...(options.ignoreFiles || [])],
    ignoreFolders: [...(defaultOptions.ignoreFolders || []), ...(options.ignoreFolders || [])],
    ignorePatterns: [...(defaultOptions.ignorePatterns || []), ...(options.ignorePatterns || [])],
    maxFileSize:
      options.maxFileSize !== undefined
        ? options.maxFileSize
        : defaultOptions.maxFileSize,
  };

  try {
    const stats = await fs.promises.stat(templatePath);
    if (!stats.isDirectory()) return EMPTY_TEMPLATE;
  } catch {
    console.warn(`Template directory not found: ${templatePath}`);
    return EMPTY_TEMPLATE;
  }

  const folderName = path.basename(templatePath);
  return processDirectory(folderName, templatePath, mergedOptions);
}

/**
 * Process directory recursively
 */
async function processDirectory(
  folderName: string,
  folderPath: string,
  options: ScanOptions
): Promise<TemplateFolder> {
  const items: TemplateItem[] = [];

  try {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryName = entry.name;
      const entryPath = path.join(folderPath, entryName);

      if (entry.isDirectory()) {
        if (options.ignoreFolders?.includes(entryName)) continue;
        items.push(await processDirectory(entryName, entryPath, options));
      } else if (entry.isFile()) {
        if (options.ignoreFiles?.includes(entryName)) continue;
        if (options.ignorePatterns?.some((p) => p.test(entryName))) continue;

        try {
          const stats = await fs.promises.stat(entryPath);
          const parsed = path.parse(entryName);

          const content =
            options.maxFileSize && stats.size > options.maxFileSize
              ? `[File too large: ${stats.size} bytes]`
              : await fs.promises.readFile(entryPath, "utf8");

          items.push({
            filename: parsed.name,
            fileExtension: parsed.ext.replace(".", ""),
            content,
          });
        } catch {
          const parsed = path.parse(entryName);
          items.push({
            filename: parsed.name,
            fileExtension: parsed.ext.replace(".", ""),
            content: "",
          });
        }
      }
    }
  } catch (error) {
    console.warn(`Error processing directory ${folderPath}`, error);
  }

  return { folderName, items };
}

/**
 * SAVE TEMPLATE STRUCTURE (SAFE VERSION)
 */
export async function saveTemplateStructureToJson(
  templatePath: string,
  outputPath: string,
  options?: ScanOptions
): Promise<void> {
  try {
    const templateStructure = await scanTemplateDirectory(templatePath, options);

    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.promises.writeFile(
      outputPath,
      JSON.stringify(templateStructure ?? EMPTY_TEMPLATE, null, 2),
      "utf8"
    );
  } catch (error) {
    console.warn("Template generation failed, writing empty template", error);

    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.promises.writeFile(
      outputPath,
      JSON.stringify(EMPTY_TEMPLATE, null, 2),
      "utf8"
    );
  }
}

/**
 * READ TEMPLATE STRUCTURE
 */
export async function readTemplateStructureFromJson(
  filePath: string
): Promise<TemplateFolder> {
  try {
    const data = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(data) as TemplateFolder;
  } catch {
    return EMPTY_TEMPLATE;
  }
}

import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius } from '../lib/theme';
import { Icon } from './Icon';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
}

export function TextField({ label, hint, ...input }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...input}
        placeholderTextColor={colors.faint}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={[styles.input, focused && styles.inputFocused]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

// Liste déroulante (choix de la filiale) : une fenêtre avec les options.
export function SelectField({ label, value, options, onChange, placeholder = 'Choisir…' }: { label: string; value: string; options: string[]; onChange: (value: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={[styles.input, styles.select]}>
        <Text style={[styles.selectText, !value && { color: colors.faint }]}>{value || placeholder}</Text>
        <Icon name="chevron-right" size={18} color={colors.faint} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.primarySoft }]}
                >
                  <Text style={[styles.optionText, item === value && { color: colors.primary, fontWeight: '700' }]}>{item}</Text>
                  {item === value ? <Icon name="check" size={18} color={colors.accent} /> : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  hint: { fontSize: 12, color: colors.muted },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.white, paddingHorizontal: 14, fontSize: 16, color: colors.text },
  inputFocused: { borderColor: colors.primary },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontSize: 16, color: colors.text, flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,20,60,0.45)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.white, borderRadius: radius.lg, maxHeight: '70%', paddingVertical: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.primary, paddingHorizontal: 18, paddingVertical: 12 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  optionText: { fontSize: 16, color: colors.text, flex: 1 },
});

package com.alorwaha.syncapp.ui

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.alorwaha.syncapp.data.ContentEntity
import com.alorwaha.syncapp.databinding.ItemContentBinding

class ContentAdapter(
    private val onClick: (ContentEntity) -> Unit,
) : RecyclerView.Adapter<ContentAdapter.VH>() {

    private val items = mutableListOf<ContentEntity>()

    fun submitList(newItems: List<ContentEntity>) {
        items.clear()
        items.addAll(newItems)
        notifyDataSetChanged()
    }

    class VH(val binding: ItemContentBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val binding = ItemContentBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        holder.binding.tvTitle.text = item.title
        holder.binding.tvSubtitle.text = item.subtitle.ifBlank { item.category.ifBlank { item.author } }
        holder.binding.tvSummary.text = item.summary.ifBlank { item.body.take(180) }
        holder.binding.root.setOnClickListener { onClick(item) }
    }

    override fun getItemCount(): Int = items.size
}
